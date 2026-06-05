import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, notFound, ownedProject } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/signals
 *
 * Query params:
 *   category    optional — one of the 8 PRD categories
 *   importance  optional — Low | Medium | High
 *   saved       optional — "true" to filter to bookmarked
 *   limit       default 100, capped at 200
 *
 * Returns latest signals (excluding dismissed). Sources are NOT inlined — the
 * dashboard fetches /api/signals/:id/sources lazily when the user expands a card.
 */
export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  const proj = await ownedProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const importance = url.searchParams.get("importance");
  const savedOnly = url.searchParams.get("saved") === "true";
  const limitRaw = parseInt(url.searchParams.get("limit") || "100", 10);
  const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 100, 1), 200);

  const rows = await sql`
    SELECT id, project_id, title, category, description, importance,
           confidence_score, suggested_action, is_saved, created_at
    FROM signals
    WHERE project_id = ${projectId}
      AND dismissed_at IS NULL
      AND (${category}::text   IS NULL OR category   = ${category})
      AND (${importance}::text IS NULL OR importance = ${importance})
      AND (${savedOnly}::boolean IS FALSE OR is_saved = true)
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return json({ signals: rows });
}
