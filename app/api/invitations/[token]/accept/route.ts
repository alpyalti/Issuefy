import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { conflict, json, notFound } from "@/lib/api";
import { captureBreadcrumb } from "@/lib/sentry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/invitations/:token/accept — claim an invitation.
 *
 * Validations:
 *   - Token exists and isn't expired / accepted / canceled
 *   - Caller's email matches the invitation's (case-insensitive)
 *   - Not already a member of the project (idempotent re-accept is fine)
 *
 * Side effects:
 *   - Inserts project_members (project_id, user_id, role, invited_by)
 *   - Stamps accepted_at on the invitation
 *   - Cancels any sibling invitations for the same project + email so a
 *     duplicate-send doesn't leave a stale token around
 *
 * Returns { projectId } — the caller redirects there.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { token } = await params;
  const sql = requireSql();

  const rows = (await sql`
    SELECT id, project_id, inviter_id, email, role, expires_at, accepted_at, canceled_at
      FROM project_invitations
     WHERE token = ${token}
     LIMIT 1
  `) as Array<{
    id: string; project_id: string; inviter_id: string; email: string;
    role: "editor" | "viewer"; expires_at: string;
    accepted_at: string | null; canceled_at: string | null;
  }>;
  const invite = rows[0];
  if (!invite) return notFound();
  if (invite.accepted_at) {
    return conflict("This invitation has already been accepted.");
  }
  if (invite.canceled_at) {
    return conflict("This invitation has been canceled.");
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return conflict("This invitation has expired.");
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return conflict(`This invitation is for ${invite.email}. Sign in with that email to accept.`);
  }

  // Insert (or upsert — if the user already has a membership we keep the
  // existing role, since downgrading via accept would be surprising).
  await sql`
    INSERT INTO project_members (project_id, user_id, role, invited_by)
    VALUES (${invite.project_id}, ${user.id}, ${invite.role}, ${invite.inviter_id})
    ON CONFLICT (project_id, user_id) DO NOTHING
  `;

  // Stamp accepted_at, and cancel any sibling invites for the same project +
  // email so an old duplicate-link can't be re-claimed.
  await sql`
    UPDATE project_invitations
       SET accepted_at = now()
     WHERE id = ${invite.id}
  `;
  await sql`
    UPDATE project_invitations
       SET canceled_at = COALESCE(canceled_at, now())
     WHERE project_id = ${invite.project_id}
       AND LOWER(email) = LOWER(${invite.email})
       AND id <> ${invite.id}
       AND accepted_at IS NULL
       AND canceled_at IS NULL
  `;

  captureBreadcrumb("invitation accepted", { projectId: invite.project_id, userId: user.id, role: invite.role });
  return json({ projectId: invite.project_id, role: invite.role });
}
