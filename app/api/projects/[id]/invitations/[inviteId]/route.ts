import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { adminProject, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

/**
 * DELETE /api/projects/:id/invitations/:inviteId — owner cancels a pending
 * invitation. We soft-cancel by stamping canceled_at so the token in the
 * already-sent email becomes inert. Idempotent (re-cancel is a no-op).
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId, inviteId } = await params;
  const proj = await adminProject(user.id, projectId);
  if (!proj) return notFound();
  const sql = requireSql();
  await sql`
    UPDATE project_invitations
       SET canceled_at = COALESCE(canceled_at, now())
     WHERE id = ${inviteId}
       AND project_id = ${projectId}
       AND accepted_at IS NULL
  `;
  return new Response(null, { status: 204 });
}
