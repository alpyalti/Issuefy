import { notFound, redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { todayUtcDate } from "@/lib/daily-summary";
import { fmtAgo, hoursAgo } from "@/lib/format";
import { EMPTY_SUMMARY_MESSAGE } from "@/components/ui/EmptyState";
import ProjectDashboard from "@/components/dashboard/ProjectDashboard";
import type { SignalItem, SourceItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

interface ProjectRow {
  id: string;
  name: string;
  company_name: string | null;
}
interface SignalRow {
  id: string;
  title: string;
  category: string;
  description: string;
  importance: "Low" | "Medium" | "High";
  confidence_score: number | null;
  suggested_action: string | null;
  is_saved: boolean;
  created_at: string;
}

// Map a domain to a tasteful brand color for the favicon chip. Stable hash
// over the domain so the same publication always looks the same.
function colorFor(domain: string): string {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) | 0;
  const palette = ["#2D5BE3", "#168F6B", "#FF6600", "#FF4500", "#E1523D", "#0A66C2", "#146AFF", "#7C3AED", "#DA552F", "#0CAA41"];
  return palette[Math.abs(h) % palette.length];
}
function initialsOf(s: string): string {
  if (!s) return "?";
  const parts = s.replace(/\.[a-z]+$/, "").split(/[\s.-]/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || s[0]).toUpperCase();
}
function dbCategoryToUi(c: string): SignalItem["category"] {
  if (c === "Competitor Move" || c === "Pricing / Offer Change" || c === "Service Demand Signal") return "competitor";
  if (c === "Market Opportunity") return "opportunity";
  if (c === "Threat / Risk" || c === "Regulation / Policy") return "threat";
  return "signal"; // Customer Pain Point + Trend Signal → "market"
}
function importanceToSeverity(i: "Low" | "Medium" | "High"): SignalItem["severity"] {
  return i === "High" ? "high" : i === "Medium" ? "med" : "low";
}

export default async function ProjectDashboardPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  // Project ownership check + basics
  const projRows = (await sql`
    SELECT id, name, company_name
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `) as ProjectRow[];
  if (!projRows[0]) {
    // If the user just deleted the project (or never had it), bounce to the
    // dashboard index, which then handles the 0/1/N cases.
    const anyRows = await sql`SELECT id FROM projects WHERE user_id = ${user.id} LIMIT 1`;
    if (!anyRows[0]) redirect("/onboarding");
    notFound();
  }
  const project = projRows[0];

  // Parallel reads: signals, summary + cited sources, recent sources rail,
  // watchlist (competitors + keywords). Neon's tagged-template returns its
  // own NeonQueryPromise; we cast the resolved rows rather than the promise.
  const [signalRowsRaw, summaryRowsRaw, recentRowsRaw, competitorsRaw, keywordsRaw] = await Promise.all([
    sql`SELECT id, title, category, description, importance, confidence_score, suggested_action, is_saved, created_at
        FROM signals WHERE project_id = ${projectId} AND dismissed_at IS NULL
        ORDER BY created_at DESC LIMIT 60`,
    sql`SELECT id, summary_date::text AS summary_date, summary_text, updated_at
        FROM daily_summaries WHERE project_id = ${projectId} AND summary_date = ${todayUtcDate()} LIMIT 1`,
    sql`SELECT title, url, domain, scraped_at
        FROM sources WHERE project_id = ${projectId} ORDER BY scraped_at DESC LIMIT 8`,
    sql`SELECT id, name, website_url, is_active FROM competitors WHERE project_id = ${projectId} ORDER BY created_at ASC`,
    sql`SELECT id, keyword, is_active FROM keywords WHERE project_id = ${projectId} ORDER BY created_at ASC`,
  ]);
  const signalRows = signalRowsRaw as unknown as SignalRow[];
  const summaryRows = summaryRowsRaw as unknown as { id: string; summary_date: string; summary_text: string; updated_at: string }[];
  const recentRows = recentRowsRaw as unknown as { title: string; url: string; domain: string; scraped_at: string }[];
  const competitors = competitorsRaw as unknown as { id: string; name: string; website_url: string; is_active: boolean }[];
  const keywords = keywordsRaw as unknown as { id: string; keyword: string; is_active: boolean }[];

  // Fetch tags per signal — we surface a single category-derived tag for now.
  // (Phase 8 could derive tags from competitor matches in the signal text.)
  const signals: SignalItem[] = signalRows.map((r) => {
    const cat = dbCategoryToUi(r.category);
    // Pull cited source titles to use as the visual source stack.
    return {
      id: r.id,
      title: r.title,
      context: r.description,
      category: cat,
      severity: importanceToSeverity(r.importance),
      isNew: hoursAgo(r.created_at) <= 24,
      saved: r.is_saved,
      hoursAgo: hoursAgo(r.created_at),
      tags: [r.category],
      sources: [],
    };
  });

  // Hydrate signal_sources for each signal in one round trip.
  const signalIds = signals.map((s) => s.id);
  if (signalIds.length > 0) {
    const sigSrcRows = (await sql`
      SELECT ss.signal_id, s.title, s.url, s.domain, s.scraped_at, s.content_snippet
      FROM signal_sources ss
      JOIN sources s ON s.id = ss.source_id
      WHERE ss.signal_id = ANY(${signalIds}::uuid[])
      ORDER BY s.scraped_at DESC
    `) as { signal_id: string; title: string; url: string; domain: string; scraped_at: string; content_snippet: string | null }[];
    const bySig = new Map<string, SourceItem[]>();
    for (const r of sigSrcRows) {
      const list = bySig.get(r.signal_id) || [];
      list.push({
        name: r.domain,
        kind: "Source",
        color: colorFor(r.domain),
        initials: initialsOf(r.domain),
        headline: r.title,
        time: fmtAgo(r.scraped_at),
        url: r.url,
      });
      bySig.set(r.signal_id, list);
    }
    for (const sig of signals) sig.sources = bySig.get(sig.id) || [];
  }

  // Summary block (with cited sources for the View Sources buttons)
  const sumRow = summaryRows[0];
  let summarySources: SourceItem[] = [];
  if (sumRow) {
    const cited = (await sql`
      SELECT s.title, s.url, s.domain, s.scraped_at, s.content_snippet
      FROM daily_summary_sources dss
      JOIN sources s ON s.id = dss.source_id
      WHERE dss.daily_summary_id = ${sumRow.id}
      ORDER BY s.scraped_at DESC
    `) as { title: string; url: string; domain: string; scraped_at: string; content_snippet: string | null }[];
    summarySources = cited.map((s) => ({
      name: s.domain,
      kind: "Source",
      color: colorFor(s.domain),
      initials: initialsOf(s.domain),
      headline: s.title,
      time: fmtAgo(s.scraped_at),
      url: s.url,
    }));
  }

  const recentSources: SourceItem[] = recentRows.map((s) => ({
    name: s.domain,
    kind: "Source",
    color: colorFor(s.domain),
    initials: initialsOf(s.domain),
    headline: s.title,
    time: fmtAgo(s.scraped_at),
    url: s.url,
  }));

  return (
    <ProjectDashboard
      project={project}
      signals={signals}
      summary={{
        summary_date: sumRow?.summary_date ?? todayUtcDate(),
        summary_text: sumRow?.summary_text ?? null,
        generated_at: sumRow?.updated_at ?? null,
        empty_message: EMPTY_SUMMARY_MESSAGE,
        sources: summarySources,
      }}
      recentSources={recentSources}
      competitorNames={competitors.map((c) => c.name)}
    />
  );
}
