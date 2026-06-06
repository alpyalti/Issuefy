import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, manageableKeyword, notFound, parseJson } from "@/lib/api";
import { keywordUpdateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/keywords/:id
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const owned = await manageableKeyword(user.id, id);
  if (!owned) return notFound();

  const body = await parseJson(req, keywordUpdateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const rows = await sql`
    UPDATE keywords SET
      keyword    = COALESCE(${body.keyword ?? null}, keyword),
      is_active  = COALESCE(${body.is_active ?? null}, is_active),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return json({ keyword: rows[0] });
}

// DELETE /api/keywords/:id
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const owned = await manageableKeyword(user.id, id);
  if (!owned) return notFound();
  const sql = requireSql();
  await sql`DELETE FROM keywords WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
