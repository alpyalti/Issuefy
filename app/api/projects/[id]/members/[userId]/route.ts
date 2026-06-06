import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { adminProject, conflict, json, notFound, ownedProject, parseJson } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; userId: string }> };

const patchSchema = z.object({
  role: z.enum(["editor", "viewer"]),
}).strict();

/**
 * PATCH /api/projects/:id/members/:userId — owner changes a member's role.
 * Owners can be neither demoted nor promoted via this route (owner transfer
 * is a v2 feature). Trying to change the owner returns a 409.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId, userId: targetUserId } = await params;
  const proj = await adminProject(user.id, projectId);
  if (!proj) return notFound();

  const body = await parseJson(req, patchSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();

  // Refuse to change the owner row — owner transfer isn't supported yet, and
  // a UI bug shouldn't be able to silently demote the paying user.
  const target = (await sql`
    SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUserId} LIMIT 1
  `) as Array<{ role: "owner" | "editor" | "viewer" }>;
  if (target.length === 0) return notFound();
  if (target[0].role === "owner") {
    return conflict("You can't change the owner's role.");
  }

  await sql`
    UPDATE project_members SET role = ${body.role}
     WHERE project_id = ${projectId} AND user_id = ${targetUserId}
  `;
  return json({ ok: true, role: body.role });
}

/**
 * DELETE /api/projects/:id/members/:userId — remove a member.
 *
 * Two cases:
 *   - Owner removes someone else → owner-only check (adminProject).
 *   - Member removes themselves   → just needs to be a member (ownedProject).
 * In both cases the owner row itself can never be removed via this route.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId, userId: targetUserId } = await params;
  const isSelfRemove = targetUserId === user.id;
  const proj = isSelfRemove
    ? await ownedProject(user.id, projectId)
    : await adminProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const target = (await sql`
    SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUserId} LIMIT 1
  `) as Array<{ role: "owner" | "editor" | "viewer" }>;
  if (target.length === 0) return notFound();
  if (target[0].role === "owner") {
    return conflict("The project owner can't be removed. Delete the project or transfer ownership instead.");
  }

  await sql`
    DELETE FROM project_members
     WHERE project_id = ${projectId} AND user_id = ${targetUserId}
  `;
  return new Response(null, { status: 204 });
}
