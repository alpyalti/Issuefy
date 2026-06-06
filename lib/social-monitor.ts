/**
 * Social-account monitoring (Stage 2.5 of the per-project pipeline).
 *
 * Today we monitor three platforms — each picked for value vs cost trade-off:
 *
 *   YouTube  (daily, standard scrape)
 *     Public channel pages return useful HTML on the standard endpoint —
 *     channel handle, latest video titles, descriptions. Cheap.
 *
 *   Reddit   (daily, direct JSON fetch — NOT ScraperAPI)
 *     Reddit exposes a public JSON variant of every page. We hit it directly
 *     so it costs $0 from the user's scrape budget. Used when a competitor
 *     has an official subreddit or user profile.
 *
 *   LinkedIn (weekly, premium + render)
 *     Aggressive anti-bot. Needs ScraperAPI premium proxies + JS rendering
 *     to get past their wall — ~5× the cost of a normal call. Limited to
 *     ONE scrape per competitor per WEEK to keep the budget sane. About-page
 *     content + the (limited) public activity it shows; full activity feed
 *     is login-gated and not retrievable.
 *
 * Instagram, X / Twitter, TikTok, Facebook are deliberately NOT included —
 * the public-visible surface area on those is too small or too brittle to
 * justify the cost. We continue to STORE the links (competitors.socials) for
 * the user's reference; we just don't fetch them.
 */
import { requireSql } from "./db";
import { upsertSource, type SourceType } from "./sources";
import { domainOf } from "./url-normalize";

const LINKEDIN_WEEKLY_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CompetitorSocials {
  id: string;
  socials?: Record<string, string> | null;
}

export interface SocialScrapeTarget {
  url: string;
  sourceType: SourceType;
  competitorId: string;
  /** ScraperAPI options. LinkedIn needs premium + render to get past their bot wall. */
  scrapeOpts: { render?: boolean; premium?: boolean };
}

/**
 * Returns the social URLs we should hit via the regular scrape path this
 * cycle (YouTube every cycle, LinkedIn only when >= 7 days since the last
 * successful LinkedIn scrape for that competitor).
 *
 * Reddit is intentionally excluded — it has its own zero-budget fetch path
 * (fetchRedditActivity), so it doesn't go through ScraperAPI at all.
 */
export async function pickSocialScrapeTargets(
  projectId: string,
  competitors: CompetitorSocials[],
): Promise<SocialScrapeTarget[]> {
  if (competitors.length === 0) return [];
  const sql = requireSql();

  // Find the most recent LinkedIn scrape per competitor in this project so we
  // can throttle LinkedIn to weekly. One round trip; falls back to "never
  // scraped" when there's no row.
  const lastLinkedinRows = (await sql`
    SELECT competitor_id, MAX(scraped_at) AS last_scraped_at
    FROM sources
    WHERE project_id = ${projectId}
      AND competitor_id IS NOT NULL
      AND domain = 'linkedin.com'
    GROUP BY competitor_id
  `) as Array<{ competitor_id: string; last_scraped_at: string }>;
  const linkedinLastByCompetitor = new Map(
    lastLinkedinRows.map((r) => [r.competitor_id, new Date(r.last_scraped_at).getTime()]),
  );

  const out: SocialScrapeTarget[] = [];
  const now = Date.now();

  for (const c of competitors) {
    const socials = c.socials ?? {};

    // YouTube — daily. Channel page surface is useful via the standard endpoint.
    const yt = socials.youtube?.trim();
    if (yt) {
      out.push({
        url: yt,
        sourceType: "Competitor Website",
        competitorId: c.id,
        scrapeOpts: {},
      });
    }

    // LinkedIn — weekly, premium + render.
    const li = socials.linkedin?.trim();
    if (li) {
      const last = linkedinLastByCompetitor.get(c.id);
      const due = !last || (now - last) >= LINKEDIN_WEEKLY_MS;
      if (due) {
        out.push({
          url: li,
          sourceType: "Competitor Website",
          competitorId: c.id,
          scrapeOpts: { premium: true, render: true },
        });
      }
    }
  }

  return out;
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Reddit — direct JSON fetch, $0 from the user's scrape budget.           */
/* ─────────────────────────────────────────────────────────────────────── */

interface RedditPostStub {
  url: string;
  title: string;
  selftext: string;
  permalink: string;
  created_utc: number;
  score: number;
  subreddit: string;
}

const REDDIT_TIMEOUT_MS = 15_000;
const REDDIT_MAX_POSTS = 5;

/**
 * Hit a Reddit subreddit / user-profile / submitted URL using the public
 * `.json` variant. Returns the top N freshest posts as compact objects. Public
 * endpoint; no auth; tolerant of failure (returns []). Reddit rate-limits
 * anonymous calls — fine at one call per competitor per cycle.
 */
async function fetchRedditPosts(redditUrl: string): Promise<RedditPostStub[]> {
  // Strip trailing slash, then append /.json (handles /r/X, /user/X, /u/X).
  const base = redditUrl.replace(/\/+$/, "");
  const url = `${base}/.json?limit=${REDDIT_MAX_POSTS}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REDDIT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        // Reddit returns 429 / blank to default User-Agents. A distinctive UA
        // gets us a normal response.
        "User-Agent": "issuefy-monitor/1.0 (+https://issuefy.app)",
        Accept: "application/json",
      },
      signal: ctl.signal,
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: { children?: Array<{ data?: Partial<RedditPostStub> }> } };
    const children = data?.data?.children ?? [];
    return children
      .map((c) => c.data ?? {})
      .filter((p): p is RedditPostStub =>
        typeof p.title === "string" && typeof p.permalink === "string",
      )
      .slice(0, REDDIT_MAX_POSTS);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch each competitor's Reddit page (if linked) and store each fresh post
 * as a source row. Returns the count of new vs upserted rows for telemetry.
 *
 * Cheap on every axis: no ScraperAPI call, no usage_counter tick (the user's
 * scrape budget is for ScraperAPI; this uses our own fetch). One round-trip
 * per competitor that has a reddit link.
 */
export async function ingestRedditActivity(
  competitors: CompetitorSocials[],
  projectId: string,
): Promise<{ scanned: number; inserted: number }> {
  let scanned = 0;
  let inserted = 0;

  for (const c of competitors) {
    const reddit = c.socials?.reddit?.trim();
    if (!reddit) continue;
    scanned++;

    const posts = await fetchRedditPosts(reddit);
    for (const p of posts) {
      const fullUrl = `https://www.reddit.com${p.permalink}`;
      try {
        const result = await upsertSource({
          projectId,
          competitorId: c.id,
          keywordId: null,
          title: p.title,
          url: fullUrl,
          sourceType: "Public Discussion",
          contentSnippet: (p.selftext || p.title).slice(0, 280),
          cleanedText: [
            `r/${p.subreddit} · score ${p.score}`,
            p.title,
            "",
            p.selftext || "(link post — no body text)",
          ].join("\n"),
        });
        if (result?.inserted) inserted++;
      } catch {
        /* swallow — individual post failures shouldn't abort the batch */
      }
    }
  }

  return { scanned, inserted };
}

/** Filter helper — keep only competitors that have at least one monitored social link set. */
export function hasMonitorableSocials(c: CompetitorSocials): boolean {
  const s = c.socials ?? {};
  return Boolean(s.youtube?.trim() || s.linkedin?.trim() || s.reddit?.trim());
}

/** Convenience: detect a domain from a URL — exposed for callers that
 *  want to mark which platform a stored source came from. */
export function platformOfUrl(url: string): "linkedin" | "youtube" | "reddit" | "other" {
  const d = domainOf(url);
  if (d.endsWith("linkedin.com")) return "linkedin";
  if (d.endsWith("youtube.com") || d.endsWith("youtu.be")) return "youtube";
  if (d.endsWith("reddit.com")) return "reddit";
  return "other";
}
