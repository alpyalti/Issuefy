/**
 * Per-project worker (PRD §13.10).
 *
 * Single function shared by the daily cron worker and the manual refresh
 * route. Phase 3 builds the discovery + scrape + dedup-store path; Phase 4 adds
 * AI signal extraction; Phase 5 adds the daily summary upsert; Phase 6 wires
 * this into the cron dispatcher and the refresh HTTP route.
 *
 * Operational contract:
 *   - Respect the account's per-cycle call budgets (reserve-before-call).
 *   - Run keyword discovery only when due (weekly cadence, PRD §10.7).
 *   - Always re-scrape the known URL set with capped concurrency.
 *   - Treat individual scrape failures as non-fatal (PRD §13.2) — log and continue.
 *   - Filter empty/blocked pages BEFORE storing (PRD §13.3, <200 cleaned chars).
 *   - Upsert sources on (project_id, url) — never insert duplicates.
 *   - Increment `sources_stored` only when a brand-new row was created.
 */
import { requireSql, withTx } from "./db";
import { standardScrape, serpDiscover } from "./scraperapi";
import { cleanForStorage } from "./cleaner";
import { upsertSource, type SourceType } from "./sources";
import { archiveRawHtml } from "./storage";
import { reserveCalls, claimCapNotice } from "./usage-counters";
import { getLimits } from "./usage";
import { sendUsageNoticeEmail, sendDailyBriefEmail } from "./mailer";
import { captureBreadcrumb, captureError } from "./sentry";
import { generateSignalsForProject } from "./signals";
import { generateDailySummaryForProject } from "./daily-summary";

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
}
interface UserRow {
  id: string;
  email: string;
  plan: string;
  email_brief_enabled: boolean;
  email_brief_unsubscribe_token: string;
}
interface CompetitorRow { id: string; website_url: string; is_active: boolean; }
interface KeywordRow { id: string; keyword: string; is_active: boolean; last_discovered_at: string | null; }

const SCRAPE_CONCURRENCY = 4; // PRD §10.7: 3–5 concurrent
const WEEKLY_MS = 7 * 24 * 3_600 * 1_000;

export type ProcessJobType = "daily" | "manual";

export interface ProcessProjectResult {
  jobId: string;
  status: "completed" | "failed";
  sourcesNew: number;
  sourcesRefreshed: number;
  serpCallsUsed: number;
  scrapeCallsUsed: number;
  signalsInserted: number;
  signalsRejected: number;
  modelUsed: string | null;
  summaryStatus: "created" | "updated" | "skipped" | "error";
  summaryDate: string | null;
  errors: string[];
}

/**
 * Run discovery → scrape → dedup-store for one project. Caller is responsible
 * for any per-hour-floor / daily-quota check on manual refresh (those checks
 * sit in the HTTP refresh route, not here).
 */
export async function processProject(projectId: string, jobType: ProcessJobType): Promise<ProcessProjectResult> {
  const sql = requireSql();
  const errors: string[] = [];
  let sourcesNew = 0;
  let sourcesRefreshed = 0;
  let serpCallsUsed = 0;
  let scrapeCallsUsed = 0;

  const projRows = (await sql`SELECT id, user_id, name FROM projects WHERE id = ${projectId} LIMIT 1`) as ProjectRow[];
  const project = projRows[0];
  if (!project) {
    throw new Error(`processProject: project ${projectId} not found`);
  }

  const userRows = (await sql`
    SELECT id, email, plan, email_brief_enabled, email_brief_unsubscribe_token
    FROM users WHERE id = ${project.user_id} LIMIT 1
  `) as UserRow[];
  const user = userRows[0];
  if (!user) throw new Error(`processProject: user ${project.user_id} not found`);

  const limits = getLimits(user.plan);

  // Open a scrape_jobs row up front so the run is traceable end-to-end (PRD §13.10).
  const jobRows = (await sql`
    INSERT INTO scrape_jobs (project_id, status, job_type, started_at)
    VALUES (${projectId}, 'running', ${jobType}, now())
    RETURNING id
  `) as { id: string }[];
  const jobId = jobRows[0].id;

  try {
    // ── Stage 1: SERP discovery (weekly cadence) ──────────────────────────
    // Keywords with NULL last_discovered_at are due immediately (just added).
    const dueKeywords = (await sql`
      SELECT id, keyword, is_active, last_discovered_at
      FROM keywords
      WHERE project_id = ${projectId}
        AND is_active = true
        AND (last_discovered_at IS NULL OR last_discovered_at < ${new Date(Date.now() - WEEKLY_MS).toISOString()})
    `) as KeywordRow[];

    for (const kw of dueKeywords) {
      // Reserve a SERP call BEFORE issuing — if we'd go over budget, pause
      // discovery for the rest of the cycle (PRD §21.4 — keep cheap competitor
      // scraping running, pause the expensive part).
      const afterReserve = await reserveCalls(user.id, "serp_calls");
      serpCallsUsed++;
      if (afterReserve > limits.serpCallsPerCycle) {
        await maybeSendCapNotice(user, "budget");
        captureBreadcrumb("serp budget reached, pausing discovery", { userId: user.id });
        break;
      }
      try {
        const results = await serpDiscover({ query: kw.keyword, topN: 3 });
        // Persist URLs as Article sources tagged with this keyword — actual
        // scraping happens in Stage 2, sharing the known-URL re-scrape pass.
        for (const r of results) {
          await upsertSource({
            projectId,
            keywordId: kw.id,
            title: r.title || r.url,
            url: r.url,
            sourceType: "Article",
            contentSnippet: r.snippet,
          });
        }
        await sql`UPDATE keywords SET last_discovered_at = now() WHERE id = ${kw.id}`;
      } catch (e) {
        errors.push(`serp:${kw.keyword}: ${e instanceof Error ? e.message : "failed"}`);
        captureError(e, { stage: "serp", projectId, keyword: kw.keyword });
      }
    }

    // ── Stage 2: scrape the known URL set (competitors + discovered URLs) ──
    const competitors = (await sql`
      SELECT id, website_url, is_active
      FROM competitors
      WHERE project_id = ${projectId} AND is_active = true
    `) as CompetitorRow[];

    const discoveredSources = (await sql`
      SELECT id, url, competitor_id, keyword_id
      FROM sources
      WHERE project_id = ${projectId}
    `) as { id: string; url: string; competitor_id: string | null; keyword_id: string | null }[];

    type ScrapeTarget = {
      url: string;
      sourceType: SourceType;
      competitorId: string | null;
      keywordId: string | null;
    };
    const targets: ScrapeTarget[] = [
      ...competitors.map((c): ScrapeTarget => ({
        url: c.website_url, sourceType: "Competitor Website", competitorId: c.id, keywordId: null,
      })),
      ...discoveredSources.map((s): ScrapeTarget => ({
        url: s.url,
        sourceType: s.competitor_id ? "Competitor Website" : s.keyword_id ? "Article" : "Other",
        competitorId: s.competitor_id,
        keywordId: s.keyword_id,
      })),
    ];

    // Per-project/day safety rail (PRD §21.3): cap how many sources this run
    // can MUTATE. We still iterate everything, but stop storing once the cap
    // is hit. New cap on top of monthly source cap.
    const todayCountRows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM sources
      WHERE project_id = ${projectId} AND scraped_at >= date_trunc('day', now())
    `) as { n: number }[];
    let storedToday = todayCountRows[0]?.n ?? 0;
    const dailyCap = limits.maxSourcesPerProjectPerDay;

    let pausedKeywordDiscovery = false;
    let scrapesPaused = false;

    // Capped parallel scraping via allSettled — one failure does not abort
    // the batch (PRD §13.2 acceptance).
    for (let i = 0; i < targets.length && !scrapesPaused; i += SCRAPE_CONCURRENCY) {
      const batch = targets.slice(i, i + SCRAPE_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((t) => scrapeAndStore(t, projectId, user.id, limits, () => storedToday)));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const t = batch[j];
        if (r.status === "rejected") {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`scrape:${t.url}: ${reason}`);
          captureError(r.reason, { stage: "scrape", projectId, url: t.url });
          if (reason === "BUDGET_EXHAUSTED") {
            scrapesPaused = true;
            await maybeSendCapNotice(user, "budget");
            break;
          }
          continue;
        }
        const value = r.value;
        if (value.skipped) continue;
        scrapeCallsUsed++;
        if (value.inserted) {
          sourcesNew++;
          storedToday++;
          // Increment sources_stored counter on each NEW source (cost-control
          // metric; re-scrape upserts don't burn this budget).
          const after = await reserveCalls(user.id, "sources_stored");
          if (after > limits.sourcesPerMonth && !pausedKeywordDiscovery) {
            pausedKeywordDiscovery = true;
            await maybeSendCapNotice(user, "sources");
            captureBreadcrumb("monthly source cap reached", { userId: user.id });
          }
          if (storedToday >= dailyCap) {
            scrapesPaused = true; // per-project/day safety rail
            break;
          }
        } else {
          sourcesRefreshed++;
        }
      }
    }

    // ── Stage 3: AI signal extraction (PRD §13.5 / §16.1) ──────────────────
    // Run regardless of whether Stage 2 created NEW sources — re-running on
    // refreshed sources is fine; insertions are append-only.
    let signalsInserted = 0;
    let signalsRejected = 0;
    let modelUsed: string | null = null;
    try {
      const result = await generateSignalsForProject(projectId);
      signalsInserted = result.inserted;
      signalsRejected = result.rejected;
      modelUsed = result.modelUsed;
      if (result.errors.length) errors.push(...result.errors.map((e) => `signals: ${e}`));
    } catch (e) {
      errors.push(`signals: ${e instanceof Error ? e.message : "failed"}`);
      captureError(e, { stage: "signals", projectId });
    }

    // ── Stage 4: Daily summary (PRD §13.6 / §16.2) ────────────────────────
    // Upsert on (project_id, summary_date) so manual refresh later today
    // updates the row in place. The unique constraint enforces this.
    let summaryStatus: "created" | "updated" | "skipped" | "error" = "skipped";
    let summaryDate: string | null = null;
    try {
      const result = await generateDailySummaryForProject(projectId);
      summaryStatus = result.status;
      summaryDate = result.summaryDate;
      if (result.modelUsed && !modelUsed) modelUsed = result.modelUsed;
      if (result.errors.length) errors.push(...result.errors.map((e) => `summary: ${e}`));
    } catch (e) {
      summaryStatus = "error";
      errors.push(`summary: ${e instanceof Error ? e.message : "failed"}`);
      captureError(e, { stage: "summary", projectId });
    }

    // ── Stage 5: Send the daily brief email (P0 sprint) ───────────────────
    // Sent ONCE per (project, day), guarded by daily_summaries.email_sent_at.
    // Only fires when:
    //   - the summary actually has text (status created/updated)
    //   - the user is opted-in
    //   - we haven't already sent for today's summary
    // Failures are non-fatal — never roll back the summary because email failed.
    let emailSent = false;
    if (summaryStatus !== "skipped" && summaryStatus !== "error" && summaryDate && user.email_brief_enabled) {
      try {
        const sendRows = (await sql`
          SELECT id, summary_text, email_sent_at,
                 COALESCE(
                   (SELECT jsonb_agg(jsonb_build_object('title', src.title, 'url', src.url, 'domain', src.domain)
                                     ORDER BY src.scraped_at DESC)
                    FROM daily_summary_sources dss
                    JOIN sources src ON src.id = dss.source_id
                    WHERE dss.daily_summary_id = ds.id),
                   '[]'::jsonb
                 ) AS sources
          FROM daily_summaries ds
          WHERE ds.project_id = ${projectId} AND ds.summary_date = ${summaryDate}
          LIMIT 1
        `) as Array<{ id: string; summary_text: string; email_sent_at: string | null; sources: Array<{ title: string; url: string; domain: string }> }>;
        const summaryRow = sendRows[0];
        if (summaryRow && !summaryRow.email_sent_at) {
          const appUrl = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");
          await sendDailyBriefEmail(user.email, {
            projectName: project.name || "your project",
            summaryDate,
            summaryText: summaryRow.summary_text,
            sources: summaryRow.sources ?? [],
            dashboardUrl: `${appUrl}/dashboard/${projectId}`,
            unsubscribeUrl: `${appUrl}/unsubscribe?token=${encodeURIComponent(user.email_brief_unsubscribe_token)}`,
          });
          // Stamp BEFORE returning so a same-day manual refresh later doesn't re-send.
          await sql`UPDATE daily_summaries SET email_sent_at = now() WHERE id = ${summaryRow.id}`;
          emailSent = true;
          captureBreadcrumb("daily brief sent", { userId: user.id, projectId, summaryDate });
        }
      } catch (e) {
        errors.push(`email: ${e instanceof Error ? e.message : "failed"}`);
        captureError(e, { stage: "email", projectId });
      }
    }
    void emailSent;

    await withTx(async (client) => {
      await client.query(
        `UPDATE projects SET last_scraped_at = now() WHERE id = $1`,
        [projectId],
      );
      await client.query(
        `UPDATE scrape_jobs SET status = 'completed', finished_at = now() WHERE id = $1`,
        [jobId],
      );
    });

    return {
      jobId, status: "completed",
      sourcesNew, sourcesRefreshed, serpCallsUsed, scrapeCallsUsed,
      signalsInserted, signalsRejected, modelUsed,
      summaryStatus, summaryDate,
      errors,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureError(e, { stage: "worker", projectId });
    try {
      await sql`
        UPDATE scrape_jobs
        SET status = 'failed', finished_at = now(), error_message = ${msg}
        WHERE id = ${jobId}
      `;
    } catch { /* noop */ }
    return {
      jobId, status: "failed",
      sourcesNew, sourcesRefreshed, serpCallsUsed, scrapeCallsUsed,
      signalsInserted: 0, signalsRejected: 0, modelUsed: null,
      summaryStatus: "error", summaryDate: null,
      errors: [...errors, msg],
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Inner: scrape one target + dedup-store
// ──────────────────────────────────────────────────────────────────────────

interface ScrapeOutcome {
  skipped: boolean;
  inserted: boolean;
}

async function scrapeAndStore(
  t: { url: string; sourceType: SourceType; competitorId: string | null; keywordId: string | null },
  projectId: string,
  userId: string,
  limits: ReturnType<typeof getLimits>,
  storedTodayGet: () => number,
): Promise<ScrapeOutcome> {
  // Reserve scrape call atomically before issuing — abort if over budget.
  const after = await reserveCalls(userId, "scrape_calls");
  if (after > limits.scrapeCallsPerCycle) throw new Error("BUDGET_EXHAUSTED");
  if (storedTodayGet() >= limits.maxSourcesPerProjectPerDay) return { skipped: true, inserted: false };

  const { html } = await standardScrape({ url: t.url });
  const cleaned = cleanForStorage(html);

  // PRD §13.3 — empty/blocked pages must NOT enter the store nor the AI layer.
  if (!cleaned.ok) return { skipped: true, inserted: false };

  // Best-effort raw HTML archival (PRD §10.6, R2_ENABLED).
  const r2Key = await archiveRawHtml(`raw/${projectId}/${Date.now()}.html`, html);

  const result = await upsertSource({
    projectId,
    competitorId: t.competitorId,
    keywordId: t.keywordId,
    title: cleaned.title || t.url,
    url: t.url,
    sourceType: t.sourceType,
    cleanedText: cleaned.snippet,
    contentSnippet: cleaned.snippet.slice(0, 280),
    r2RawHtmlKey: r2Key,
  });

  return { skipped: false, inserted: result.inserted };
}

async function maybeSendCapNotice(user: UserRow, kind: "sources" | "budget") {
  try {
    if (await claimCapNotice(user.id)) {
      await sendUsageNoticeEmail(user.email, kind);
    }
  } catch (e) {
    captureError(e, { stage: "cap-notice" });
  }
}
