import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject } from "@/lib/project-data";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { colorFor, initialsOf } from "@/lib/avatar";
import { fmtAgo } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }>; searchParams: Promise<{ date?: string }> };

/**
 * /dashboard/[projectId]/archive[?date=YYYY-MM-DD]
 *
 * Browse past daily summaries. Left column = chronological list of days that
 * have a stored summary (cheap query, no calendar grid yet for MVP). Right
 * column = the chosen day's summary text + cited sources. Defaults to the
 * most recent day with a summary.
 */
export default async function ArchivePage({ params, searchParams }: Ctx) {
  const { projectId } = await params;
  const { date } = await searchParams;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const project = await getProject(projectId, user.id);
  if (!project) notFound();

  type DayRow = { summary_date: string; signal_count: number };
  const days = (await sql`
    SELECT
      ds.summary_date::text AS summary_date,
      (SELECT COUNT(*)::int FROM signals s
        WHERE s.project_id = ${projectId}
          AND s.dismissed_at IS NULL
          AND date_trunc('day', s.created_at AT TIME ZONE 'UTC') = ds.summary_date
      ) AS signal_count
    FROM daily_summaries ds
    WHERE ds.project_id = ${projectId}
    ORDER BY ds.summary_date DESC
    LIMIT 90
  `) as unknown as DayRow[];

  if (days.length === 0) {
    return (
      <div className="page-wrap">
        <EmptyState
          icon="DashboardSquare01Icon"
          message="No briefs yet. Your archive populates once Issuefy starts producing daily summaries."
          ctaLabel="Back to dashboard"
          ctaHref={`/dashboard/${projectId}`}
        />
      </div>
    );
  }

  const validDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const chosenDate = date && validDateRegex.test(date) && days.some((d) => d.summary_date === date)
    ? date
    : days[0].summary_date;

  type SummaryRow = { id: string; summary_text: string; updated_at: string };
  const summaryRows = (await sql`
    SELECT id, summary_text, updated_at
    FROM daily_summaries
    WHERE project_id = ${projectId} AND summary_date = ${chosenDate}
    LIMIT 1
  `) as unknown as SummaryRow[];
  const summary = summaryRows[0];

  type SourceRow = { title: string; url: string; domain: string; scraped_at: string };
  const sources = summary ? (await sql`
    SELECT s.title, s.url, s.domain, s.scraped_at
    FROM daily_summary_sources dss
    JOIN sources s ON s.id = dss.source_id
    WHERE dss.daily_summary_id = ${summary.id}
    ORDER BY s.scraped_at DESC
  `) as unknown as SourceRow[] : [];

  const chosenLabel = new Date(`${chosenDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });

  return (
    <div className="page-wrap" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 28 }}>
      <aside className="archive-list card" style={{ padding: 8, maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
        <div className="side-label" style={{ padding: "10px 12px 8px" }}>Archive</div>
        {days.map((d) => {
          const isOn = d.summary_date === chosenDate;
          const date = new Date(`${d.summary_date}T00:00:00Z`);
          const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
          return (
            <Link
              key={d.summary_date}
              href={`/dashboard/${projectId}/archive?date=${d.summary_date}`}
              className={"archive-item " + (isOn ? "on" : "")}
              prefetch={false}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="archive-item-day">{label}</span>
                <span className="archive-item-sub">{d.signal_count} signal{d.signal_count === 1 ? "" : "s"}</span>
              </span>
              {isOn && <Icon name="ArrowRight01Icon" size={14} stroke={2} />}
            </Link>
          );
        })}
      </aside>

      <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {summary ? (
          <>
            <header>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: 28 }}>{chosenLabel}</h1>
              <p className="muted" style={{ marginTop: 4, fontSize: 13.5 }}>Daily AI summary · last updated {fmtAgo(summary.updated_at)}</p>
            </header>
            <article className="brief-card" style={{ animation: "rise .3s ease both" }}>
              <div className="brief-glow" />
              <div className="brief-eyebrow"><Icon name="SparklesIcon" size={14} stroke={1.7} color="#cdd6ff" /> AI summary · {chosenDate}</div>
              <p className="brief-body" style={{ marginTop: 14 }}>{summary.summary_text}</p>
            </article>
            {sources.length > 0 && (
              <section className="card" style={{ padding: 18 }}>
                <h3 style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 14 }}>Sources cited</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sources.map((s, i) => (
                    <a key={i} className="rail-source" href={s.url} target="_blank" rel="noopener noreferrer" style={{ borderBottom: "none", padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
                      <span className="favicon" style={{ background: colorFor(s.domain), width: 26, height: 26, fontSize: 10 }}>{initialsOf(s.domain)}</span>
                      <span className="rail-src-meta">
                        <span className="rail-src-head">{s.title}</span>
                        <span className="rail-src-sub">{s.domain} · {fmtAgo(s.scraped_at)}</span>
                      </span>
                      <Icon name="ArrowUpRight01Icon" size={14} stroke={1.7} />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <EmptyState icon="DashboardSquare01Icon" message="No summary for that day." />
        )}
      </section>
    </div>
  );
}
