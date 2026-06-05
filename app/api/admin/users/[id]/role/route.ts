import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, parseJson } from "@/lib/api";
import { captureBreadcrumb } from "@/lib/sentry";

export const runtime = "nodejs";

const bodySchema = z.object({
  role: z.enum(["user", "admin"]),
}).strict();

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi();
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  // Don't let an admin de-elevate themselves (safety guard).
  if (id === admin.id && body.role !== "admin") {
    return new Response("Cannot revoke your own admin role", { status: 409 });
  }

  const sql = requireSql();
  const rows = await sql`
    UPDATE users SET role = ${body.role}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, email, role
  `;
  captureBreadcrumb("admin.role_change", { actor: admin.id, target: id, newRole: body.role });
  return json({ user: rows[0] });
}
