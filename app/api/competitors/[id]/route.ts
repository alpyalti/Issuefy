import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, manageableCompetitor, notFound, parseJson } from "@/lib/api";
import { competitorUpdateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/competitors/:id — edit fields (name, URL, notes, socials, is_active).
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const owned = await manageableCompetitor(user.id, id);
  if (!owned) return notFound();

  const body = await parseJson(req, competitorUpdateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const rows = await sql`
    UPDATE competitors SET
      name        = COALESCE(${body.name ?? null}, name),
      website_url = COALESCE(${body.website_url ?? null}, website_url),
      description = COALESCE(${body.description ?? null}, description),
      logo_url    = COALESCE(${body.logo_url ?? null}, logo_url),
      socials     = COALESCE(${body.socials ? JSON.stringify(body.socials) : null}::jsonb, socials),
      notes       = COALESCE(${body.notes ?? null}, notes),
      is_active   = COALESCE(${body.is_active ?? null}, is_active),
      updated_at  = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return json({ competitor: rows[0] });
}

// DELETE /api/competitors/:id
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const owned = await manageableCompetitor(user.id, id);
  if (!owned) return notFound();
  const sql = requireSql();
  await sql`DELETE FROM competitors WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
