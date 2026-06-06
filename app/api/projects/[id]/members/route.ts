import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, notFound, ownedProject } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/members — list members + pending invitations.
 *
 * Any member can read (so the team list shows up in everyone's settings).
 * Mutations (invite, role change, remove) live on separate routes and are
 * owner-only.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  const proj = await ownedProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();

  // Members: every project_members row joined to the user row for display
  // (name/email/avatar initials). Ordered owner-first, then by created_at.
  const members = (await sql`
    SELECT pm.user_id    AS id,
           u.email,
           u.name,
           pm.role,
           pm.created_at AS joined_at
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ${projectId}
     ORDER BY CASE pm.role
                WHEN 'owner' THEN 0
                WHEN 'editor' THEN 1
                ELSE 2
              END,
              pm.created_at ASC
  `) as Array<{ id: string; email: string; name: string | null; role: "owner" | "editor" | "viewer"; joined_at: string }>;

  // Pending invitations — not yet accepted, not canceled, not expired.
  const invitations = (await sql`
    SELECT id, email, role, expires_at, created_at
      FROM project_invitations
     WHERE project_id = ${projectId}
       AND accepted_at IS NULL
       AND canceled_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
  `) as Array<{ id: string; email: string; role: "editor" | "viewer"; expires_at: string; created_at: string }>;

  return json({ members, invitations });
}
