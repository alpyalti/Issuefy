import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { adminProject, json, manageableProject, notFound, ownedProject, parseJson } from "@/lib/api";
import { projectUpdateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/projects/:id — project details. Any member can read.
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const proj = await ownedProject(user.id, id);
  if (!proj) return notFound();
  return json({ project: proj });
}

// PATCH /api/projects/:id — update fields. Editors and owners can mutate;
// viewers get a 404 (not a 403, to avoid leaking project existence).
// TODO (Phase 5): split field-level — track_company + company_* should be
// owner-only. For now an editor can change them too.
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const proj = await manageableProject(user.id, id);
  if (!proj) return notFound();

  const body = await parseJson(req, projectUpdateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  // Build the UPDATE with COALESCE so absent keys keep their current value —
  // simpler than dynamic SQL for ~10 fields, and the type checker keeps us honest.
  const rows = await sql`
    UPDATE projects SET
      name                = COALESCE(${body.name ?? null},                name),
      company_name        = COALESCE(${body.company_name ?? null},        company_name),
      company_website     = COALESCE(${body.company_website ?? null},     company_website),
      company_description = COALESCE(${body.company_description ?? null}, company_description),
      company_logo_url    = COALESCE(${body.company_logo_url ?? null},    company_logo_url),
      company_socials     = COALESCE(${body.company_socials ? JSON.stringify(body.company_socials) : null}::jsonb, company_socials),
      track_company       = COALESCE(${body.track_company ?? null},       track_company),
      industry            = COALESCE(${body.industry ?? null},            industry),
      business_type       = COALESCE(${body.business_type ?? null},       business_type),
      target_market       = COALESCE(${body.target_market ?? null},       target_market),
      description         = COALESCE(${body.description ?? null},         description),
      is_active           = COALESCE(${body.is_active ?? null},           is_active),
      updated_at          = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return json({ project: rows[0] });
}

// DELETE /api/projects/:id — owner only. Cascades to all child rows (FKs ON DELETE CASCADE).
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const proj = await adminProject(user.id, id);
  if (!proj) return notFound();
  const sql = requireSql();
  await sql`DELETE FROM projects WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
