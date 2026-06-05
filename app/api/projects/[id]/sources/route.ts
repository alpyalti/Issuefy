import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, notFound, ownedProject } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/projects/:id/sources — filters: source_type, competitor, keyword, since.
// Source filters are gated to Growth+ in PRD §21.1; during beta we expose them
// but the dashboard UI shows them disabled for Starter users (Phase 7 polish).
export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  const proj = await ownedProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const url = new URL(req.url);
  const sourceType = url.searchParams.get("source_type");
  const competitorId = url.searchParams.get("competitor_id");
  const keywordId = url.searchParams.get("keyword_id");
  const since = url.searchParams.get("since"); // ISO date

  // Compose the WHERE with safe nullable params — Neon's tagged-template driver
  // handles the parameter binding so user input is never concatenated.
  const rows = await sql`
    SELECT id, project_id, competitor_id, keyword_id, title, url, domain,
           source_type, scraped_at, content_snippet, r2_raw_html_key, created_at
    FROM sources
    WHERE project_id = ${projectId}
      AND (${sourceType}::text IS NULL OR source_type = ${sourceType})
      AND (${competitorId}::uuid IS NULL OR competitor_id = ${competitorId}::uuid)
      AND (${keywordId}::uuid    IS NULL OR keyword_id    = ${keywordId}::uuid)
      AND (${since}::timestamptz IS NULL OR scraped_at   >= ${since}::timestamptz)
    ORDER BY scraped_at DESC
    LIMIT 500
  `;
  return json({ sources: rows });
}
