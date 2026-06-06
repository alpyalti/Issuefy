import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { requireSql } from "@/lib/db";
import { getLimits, HARD_CAPS } from "@/lib/usage";
import { conflict, json, manageableProject, notFound, parseJson } from "@/lib/api";
import { competitorCreateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/competitors — add a competitor by URL (+ optional
// confirmed enrichment fields). Enforces per-project plan cap AND hard cap of 5.
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId } = await params;
  // Editors + owners can manage watchlist; viewers get 404.
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();

  const body = await parseJson(req, competitorCreateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const limit = Math.min(getLimits(user.plan).competitorsPerProject, HARD_CAPS.competitorsPerProject);

  const countRows = (await sql`SELECT COUNT(*)::int AS n FROM competitors WHERE project_id = ${projectId}`) as { n: number }[];
  if ((countRows[0]?.n ?? 0) >= limit) {
    return conflict(`This project allows ${limit} competitor${limit === 1 ? "" : "s"}. Remove one or upgrade your plan.`);
  }

  // Pick a sensible name from the body or fall back to the host.
  const inferredName = body.name?.trim() || body.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  const status = body.name || body.description || body.logo_url || body.socials ? "manual" : null;
  // Phase 3 will replace `null` here with the real enrichment_status from /api/enrich.

  const rows = await sql`
    INSERT INTO competitors (
      project_id, name, website_url, description, logo_url, socials, notes, enrichment_status
    ) VALUES (
      ${projectId}, ${inferredName}, ${body.website_url},
      ${body.description ?? null},
      ${body.logo_url ?? null},
      ${body.socials ? JSON.stringify(body.socials) : null},
      ${body.notes ?? null},
      ${status}
    )
    RETURNING *
  `;
  return json({ competitor: rows[0] }, { status: 201 });
}
