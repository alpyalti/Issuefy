import { notFound, redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject, getCompetitors } from "@/lib/project-data";
import { todayUtcDate } from "@/lib/daily-summary";
import { fmtAgo, hoursAgo } from "@/lib/format";
import { colorFor, initialsOf } from "@/lib/avatar";
import { EMPTY_SUMMARY_MESSAGE } from "@/components/ui/EmptyState";
import ProjectDashboard from "@/components/dashboard/ProjectDashboard";
import type { SignalItem, SourceItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

// A single row from the bundled signals-with-sources query.
interface BundledSignalRow {
  id: string;
  title: string;
  category: string;
  description: string;
  importance: "Low" | "Medium" | "High";
  confidence_score: number | null;
  suggested_action: string | null;
  is_saved: boolean;
  user_note: string | null;
  action_done_at: string | null;
  created_at: string;
  // jsonb_agg yields an array of objects (or [null] when empty before filter).
  sources: Array<{ title: string; url: string; domain: string; scraped_at: string }> | null;
}

// A bundled daily-summary + cited sources row.
interface BundledSummaryRow {
  id: string;
  summary_date: string;
  summary_text: string;
  updated_at: string;
  sources: Array<{ title: string; url: string; domain: string; scraped_at: string }> | null;
}

function dbCategoryToUi(c: string): SignalItem["category"] {
  if (c === "Competitor Move" || c === "Pricing / Offer Change" || c === "Service Demand Signal") return "competitor";
  if (c === "Market Opportunity") return "opportunity";
  if (c === "Threat / Risk" || c === "Regulation / Policy") return "threat";
  return "signal";
}
function importanceToSeverity(i: "Low" | "Medium" | "High"): SignalItem["severity"] {
  return i === "High" ? "high" : i === "Medium" ? "med" : "low";
}
function toSourceItem(s: { title: string; url: string; domain: string; scraped_at: string }): SourceItem {
  return {
    name: s.domain,
    kind: "Source",
    color: colorFor(s.domain),
    initials: initialsOf(s.domain),
    headline: s.title,
    time: fmtAgo(s.scraped_at),
    url: s.url,
  };
}

export default async function ProjectDashboardPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  // Project ownership check (cached — also fetched by layout, single round trip).
  const project = await getProject(projectId, user.id);
  if (!project) {
    const anyRows = await sql`SELECT id FROM projects WHERE user_id = ${user.id} LIMIT 1`;
    if (!anyRows[0]) redirect("/onboarding");
    notFound();
  }

  // Three parallel queries, each self-contained:
  //   1. signals WITH their cited sources (jsonb_agg, no second round-trip)
  //   2. today's daily summary WITH its cited sources (same trick)
  //   3. recent sources for the right rail
  // getCompetitors() comes from the React cache() helper so it dedupes with
  // the layout's call.
  const today = todayUtcDate();
  const [signalRowsRaw, summaryRowsRaw, recentRowsRaw, competitorsCached] = await Promise.all([
    sql`
      SELECT
        s.id, s.title, s.category, s.description, s.importance, s.confidence_score,
        s.suggested_action, s.is_saved, s.user_note, s.action_done_at, s.created_at,
        COALESCE(
          jsonb_agg(jsonb_build_object(
            'title',      src.title,
            'url',        src.url,
            'domain',     src.domain,
            'scraped_at', src.scraped_at
          ) ORDER BY src.scraped_at DESC) FILTER (WHERE src.id IS NOT NULL),
          '[]'::jsonb
        ) AS sources
      FROM signals s
      LEFT JOIN signal_sources ss ON ss.signal_id = s.id
      LEFT JOIN sources src       ON src.id = ss.source_id
      WHERE s.project_id = ${projectId} AND s.dismissed_at IS NULL
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 60
    `,
    sql`
      SELECT
        ds.id,
        ds.summary_date::text AS summary_date,
        ds.summary_text,
        ds.updated_at,
        COALESCE(
          jsonb_agg(jsonb_build_object(
            'title',      src.title,
            'url',        src.url,
            'domain',     src.domain,
            'scraped_at', src.scraped_at
          ) ORDER BY src.scraped_at DESC) FILTER (WHERE src.id IS NOT NULL),
          '[]'::jsonb
        ) AS sources
      FROM daily_summaries ds
      LEFT JOIN daily_summary_sources dss ON dss.daily_summary_id = ds.id
      LEFT JOIN sources src               ON src.id = dss.source_id
      WHERE ds.project_id = ${projectId} AND ds.summary_date = ${today}
      GROUP BY ds.id
      LIMIT 1
    `,
    sql`
      SELECT title, url, domain, scraped_at
      FROM sources WHERE project_id = ${projectId}
      ORDER BY scraped_at DESC LIMIT 8
    `,
    getCompetitors(projectId),
  ]);

  const signalRows = signalRowsRaw as unknown as BundledSignalRow[];
  const summaryRows = summaryRowsRaw as unknown as BundledSummaryRow[];
  const recentRows = recentRowsRaw as unknown as Array<{ title: string; url: string; domain: string; scraped_at: string }>;

  const signals: SignalItem[] = signalRows.map((r) => ({
    id: r.id,
    title: r.title,
    context: r.description,
    category: dbCategoryToUi(r.category),
    severity: importanceToSeverity(r.importance),
    isNew: hoursAgo(r.created_at) <= 24,
    saved: r.is_saved,
    hoursAgo: hoursAgo(r.created_at),
    tags: [r.category],
    sources: (r.sources ?? []).map(toSourceItem),
    suggestedAction: r.suggested_action,
    userNote: r.user_note,
    actionDone: !!r.action_done_at,
  }));

  const sumRow = summaryRows[0];
  const summarySources: SourceItem[] = (sumRow?.sources ?? []).map(toSourceItem);
  const recentSources: SourceItem[] = recentRows.map(toSourceItem);

  // First-run: project has never been scraped AND no signals yet.
  // (signals.length is checked too so a paused/all-dismissed project doesn't
  // re-show the activation card.)
  const firstRun = !project.last_scraped_at && signals.length === 0;

  return (
    <ProjectDashboard
      project={project}
      signals={signals}
      summary={{
        summary_date: sumRow?.summary_date ?? today,
        summary_text: sumRow?.summary_text ?? null,
        generated_at: sumRow?.updated_at ?? null,
        empty_message: EMPTY_SUMMARY_MESSAGE,
        sources: summarySources,
      }}
      recentSources={recentSources}
      competitorNames={competitorsCached.map((c) => c.name)}
      firstRun={firstRun}
    />
  );
}
