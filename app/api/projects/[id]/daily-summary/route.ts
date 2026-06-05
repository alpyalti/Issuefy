import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, notFound, ownedProject } from "@/lib/api";
import { todayUtcDate } from "@/lib/daily-summary";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/daily-summary
 *
 * Returns today's summary (UTC date) for one project + the sources cited.
 * When no row exists for today, returns an empty payload so the dashboard
 * can render the PRD §13.6 empty state without a 404 round trip.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  const proj = await ownedProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const summaryDate = todayUtcDate();

  const rows = (await sql`
    SELECT id, project_id, summary_date, summary_text, created_at, updated_at
    FROM daily_summaries
    WHERE project_id = ${projectId} AND summary_date = ${summaryDate}
    LIMIT 1
  `) as { id: string; project_id: string; summary_date: string; summary_text: string; created_at: string; updated_at: string }[];

  if (rows.length === 0) {
    return json({
      summary: null,
      summary_date: summaryDate,
      sources: [],
      empty_message: "Issuefy has not found enough useful market signals yet. Add more competitors or keywords, or run a refresh.",
    });
  }

  const summary = rows[0];
  const sources = await sql`
    SELECT s.id, s.title, s.url, s.domain, s.source_type, s.scraped_at, s.content_snippet
    FROM daily_summary_sources dss
    JOIN sources s ON s.id = dss.source_id
    WHERE dss.daily_summary_id = ${summary.id}
    ORDER BY s.scraped_at DESC
  `;
  return json({ summary, summary_date: summaryDate, sources });
}
