import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject } from "@/lib/project-data";
import KeywordHub, {
  type KwRow, type KwTrendPoint, type KwCategory, type KwSignal,
} from "@/components/keyword/KeywordHub";
import type { Lead } from "@/components/leads/LeadCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Keyword insights — Issuefy" };

type Ctx = { params: Promise<{ projectId: string; keywordId: string }> };

/**
 * Keyword hub — signals + 12-week trend + categories + discovered leads for
 * one keyword. Access control mirrors every project page (getProject), then
 * the keyword must belong to the project.
 */
export default async function KeywordHubPage({ params }: Ctx) {
  const { projectId, keywordId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const project = await getProject(projectId, user.id);
  if (!project) notFound();

  const kwRows = (await sql`
    SELECT id, keyword, is_active, last_discovered_at::text AS last_discovered_at
    FROM keywords WHERE id = ${keywordId} AND project_id = ${projectId} LIMIT 1
  `) as KwRow[];
  const keyword = kwRows[0];
  if (!keyword) notFound();

  const [sigRows, trendRows, catRows, srcRows, leadRows] = await Promise.all([
    sql`
      SELECT s.id, s.title, s.category, s.importance, s.created_at::text AS created_at
      FROM signals s
      WHERE s.project_id = ${projectId} AND s.dismissed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM signal_sources ss
          JOIN sources src ON src.id = ss.source_id
          WHERE ss.signal_id = s.id AND src.keyword_id = ${keywordId}
        )
      ORDER BY s.created_at DESC LIMIT 20
    ` as unknown as Promise<KwSignal[]>,
    sql`
      SELECT to_char(date_trunc('week', s.created_at), 'YYYY-MM-DD') AS wk, COUNT(DISTINCT s.id)::int AS n
      FROM signals s
      JOIN signal_sources ss ON ss.signal_id = s.id
      JOIN sources src ON src.id = ss.source_id
      WHERE src.keyword_id = ${keywordId} AND s.project_id = ${projectId}
        AND s.created_at >= now() - interval '12 weeks'
      GROUP BY wk ORDER BY wk
    ` as unknown as Promise<{ wk: string; n: number }[]>,
    sql`
      SELECT s.category, COUNT(DISTINCT s.id)::int AS count
      FROM signals s
      JOIN signal_sources ss ON ss.signal_id = s.id
      JOIN sources src ON src.id = ss.source_id
      WHERE src.keyword_id = ${keywordId} AND s.project_id = ${projectId} AND s.dismissed_at IS NULL
      GROUP BY s.category ORDER BY count DESC
    ` as unknown as Promise<KwCategory[]>,
    sql`SELECT COUNT(*)::int AS n FROM sources WHERE keyword_id = ${keywordId}` as unknown as Promise<{ n: number }[]>,
    sql`
      SELECT id, keyword_id, platform, post_url, post_title, post_excerpt, author, author_url,
             context, posted_at::text AS posted_at, engagement, lead_score, intent, reason,
             draft_reply, status
      FROM keyword_leads WHERE keyword_id = ${keywordId} AND lead_score >= 70
      ORDER BY lead_score DESC, created_at DESC LIMIT 50
    ` as unknown as Promise<Lead[]>,
  ]);

  // Build a 12-week trend series (Monday-aligned), filling gaps with 0.
  const counts = new Map(trendRows.map((r) => [r.wk, r.n]));
  const trend: KwTrendPoint[] = [];
  const monday = new Date();
  const day = (monday.getUTCDay() + 6) % 7; // 0 = Monday
  monday.setUTCDate(monday.getUTCDate() - day);
  monday.setUTCHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, value: counts.get(key) ?? 0 });
  }

  const totalSignals = catRows.reduce((a, c) => a + c.count, 0);
  const weekSignals = sigRows.filter((s) => Date.now() - new Date(s.created_at).getTime() < 7 * 86_400_000).length;
  const leadsActive = leadRows.filter((l) => l.status !== "dismissed").length;

  return (
    <KeywordHub
      projectId={projectId}
      keyword={keyword}
      stats={{ totalSignals, weekSignals, sources: srcRows[0]?.n ?? 0, leads: leadsActive }}
      trend={trend}
      categories={catRows}
      signals={sigRows}
      leads={leadRows}
    />
  );
}
