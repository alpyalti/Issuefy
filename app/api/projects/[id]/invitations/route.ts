import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { requireSql } from "@/lib/db";
import { adminProject, conflict, json, notFound, parseJson } from "@/lib/api";
import { getLimits } from "@/lib/usage";
import { sendInvitationEmail } from "@/lib/mailer";
import { captureBreadcrumb, captureError } from "@/lib/sentry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["editor", "viewer"]),
}).strict();

/**
 * POST /api/projects/:id/invitations — owner sends a project invitation.
 *
 * Seat cap is enforced per-account: count distinct users with any role on any
 * project this user owns (the owner himself counts once even if he owns
 * multiple) + pending non-expired invites. Reject when count + 1 > limits.seats.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId } = await params;
  const proj = await adminProject<{ id: string; name: string; user_id: string }>(user.id, projectId);
  if (!proj) return notFound();

  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const limits = getLimits(user.plan);

  // Inviting your own email is silly — also a footgun against the same-email
  // accept flow which expects a distinct user.
  if (body.email.toLowerCase() === user.email.toLowerCase()) {
    return conflict("You can't invite yourself.");
  }

  // Already a member of this project? Block — no point inviting again.
  const existingMember = (await sql`
    SELECT 1 FROM project_members pm
      JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ${projectId}
       AND LOWER(u.email) = LOWER(${body.email})
     LIMIT 1
  `) as Array<{ "?column?": number }>;
  if (existingMember.length > 0) {
    return conflict("That person is already a member of this project.");
  }

  // Same-email pending invitation on this project? Treat as a no-op so a
  // double-click doesn't double-mail (the existing token stays valid).
  const existingPending = (await sql`
    SELECT id, token FROM project_invitations
     WHERE project_id = ${projectId}
       AND LOWER(email) = LOWER(${body.email})
       AND accepted_at IS NULL
       AND canceled_at IS NULL
       AND expires_at > now()
     LIMIT 1
  `) as Array<{ id: string; token: string }>;
  if (existingPending.length > 0) {
    return conflict("An invitation to that email is already pending.");
  }

  // Per-account seat cap, enforced atomically by Postgres. We count:
  //   - distinct user_ids that are members of any project owned by THIS owner
  //     (the owner counts as one; their own membership on each project is the
  //     same user_id)
  //   - plus pending, non-expired, non-accepted invites on any project owned
  //     by this owner
  // The +1 below represents this new invitation.
  //
  // Previously: SELECT count, JS compare, INSERT — raced under concurrent
  // requests (two parallel invites at the boundary both passed the check
  // and both inserted, blowing the seat cap). Now: INSERT ... SELECT WHERE
  // the seat math passes. Single statement, single round-trip; the subqueries
  // can't see another in-flight insert that hasn't committed yet, so the
  // race window collapses from "network roundtrip" to "single SQL statement
  // execution". If the cap is hit, INSERT returns 0 rows and we 409.
  const rows = (await sql`
    INSERT INTO project_invitations (project_id, inviter_id, email, role)
    SELECT ${projectId}::uuid, ${user.id}, ${body.email}, ${body.role}
    WHERE (
      (SELECT COUNT(DISTINCT pm.user_id)::int
         FROM project_members pm
         JOIN projects p ON p.id = pm.project_id
        WHERE p.user_id = ${user.id})
      +
      (SELECT COUNT(*)::int
         FROM project_invitations pi
         JOIN projects p ON p.id = pi.project_id
        WHERE p.user_id = ${user.id}
          AND pi.accepted_at IS NULL
          AND pi.canceled_at IS NULL
          AND pi.expires_at > now())
    ) + 1 <= ${limits.seats}
    RETURNING id, email, role, token, expires_at, created_at
  `) as Array<{ id: string; email: string; role: "editor" | "viewer"; token: string; expires_at: string; created_at: string }>;
  if (rows.length === 0) {
    return conflict(
      `Your plan allows ${limits.seats} team seat${limits.seats === 1 ? "" : "s"} (you plus invitees). Upgrade for more.`,
    );
  }
  const invite = rows[0];

  // Send the email best-effort — non-fatal so a Resend hiccup doesn't lose
  // the invitation (it's already in the DB; the owner can resend later).
  const appUrl = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");
  try {
    await sendInvitationEmail(invite.email, {
      inviterName: user.name || user.email,
      inviterEmail: user.email,
      projectName: proj.name,
      role: invite.role,
      acceptUrl: `${appUrl}/invite/${encodeURIComponent(invite.token)}`,
      appUrl,
    });
    captureBreadcrumb("invitation sent", { projectId, invitee: invite.email, role: invite.role });
  } catch (e) {
    captureError(e, { stage: "invitation.email", projectId });
  }

  // Don't leak the token in the response — it's only useful inside the email.
  // Inviter can cancel + re-send if needed.
  return json({
    invitation: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
      created_at: invite.created_at,
    },
  }, { status: 201 });
}
