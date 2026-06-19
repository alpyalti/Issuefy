/**
 * Lead-source search — Reddit + Hacker News (Lead Discovery).
 *
 * Both are free public APIs that expose the post author + body, which is what
 * the classifier needs to judge buying intent. Quora is intentionally absent
 * (no API, heavy anti-bot — deferred). Every function fails soft to [] so one
 * platform hiccup never aborts a keyword scan.
 */
import { standardScrape } from "./scraperapi";
import { apifyEnabled, searchRedditViaApify } from "./apify";
import { captureBreadcrumb } from "./sentry";

export type LeadPlatform = "reddit" | "hackernews";

export interface RawLead {
  platform: LeadPlatform;
  postUrl: string;
  title: string;
  excerpt: string;          // post body, trimmed
  author: string | null;
  authorUrl: string | null;
  context: string;          // "r/SaaS" | "Hacker News"
  postedAt: string | null;  // ISO
  engagement: number | null;
}

const HN_TIMEOUT_MS = 12_000;
const REDDIT_TIMEOUT_MS = 15_000;
const ISSUEFY_UA = "issuefy-monitor/1.0 (+https://issuefy.app)";

function clip(s: string | null | undefined, n: number): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

/* ─────────────────────────── Hacker News ─────────────────────────── */

interface HnHit {
  objectID?: string;
  author?: string;
  title?: string;
  url?: string;
  story_text?: string;
  comment_text?: string;
  created_at_i?: number;
  points?: number;
  num_comments?: number;
}

/**
 * Search HN stories newer than `sinceUnix` via the Algolia API (free, no key).
 * Returns the post permalink (news.ycombinator.com/item) so the user lands on
 * the discussion, not the external link.
 */
export async function searchHackerNews(keyword: string, sinceUnix: number): Promise<RawLead[]> {
  const params = new URLSearchParams({
    query: keyword,
    tags: "story",
    numericFilters: `created_at_i>${sinceUnix}`,
    hitsPerPage: "20",
  });
  const url = `https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), HN_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: HnHit[] };
    const hits = data.hits ?? [];
    const out: RawLead[] = [];
    for (const h of hits) {
      if (!h.objectID || !h.title) continue;
      const body = clip(h.story_text || h.comment_text, 500);
      out.push({
        platform: "hackernews",
        postUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: clip(h.title, 300),
        excerpt: body,
        author: h.author ?? null,
        authorUrl: h.author ? `https://news.ycombinator.com/user?id=${h.author}` : null,
        context: "Hacker News",
        postedAt: h.created_at_i ? new Date(h.created_at_i * 1000).toISOString() : null,
        engagement: typeof h.points === "number" ? h.points : null,
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/* ─────────────────────────── Reddit ─────────────────────────── */

interface RedditChild {
  data?: {
    title?: string;
    selftext?: string;
    author?: string;
    permalink?: string;
    subreddit?: string;
    created_utc?: number;
    score?: number;
    num_comments?: number;
    over_18?: boolean;
  };
}

function mapRedditListing(json: unknown): RawLead[] {
  const children = (json as { data?: { children?: RedditChild[] } })?.data?.children ?? [];
  const out: RawLead[] = [];
  for (const c of children) {
    const d = c.data;
    if (!d || !d.title || !d.permalink || d.over_18) continue;
    out.push({
      platform: "reddit",
      postUrl: `https://www.reddit.com${d.permalink}`,
      title: clip(d.title, 300),
      excerpt: clip(d.selftext, 500),
      author: d.author ?? null,
      authorUrl: d.author && d.author !== "[deleted]" ? `https://www.reddit.com/user/${d.author}` : null,
      context: d.subreddit ? `r/${d.subreddit}` : "Reddit",
      postedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      engagement: typeof d.score === "number" ? d.score : null,
    });
  }
  return out;
}

/**
 * Search Reddit for recent posts matching the keyword.
 *
 * Preferred path: Apify's Reddit Scraper Lite (when APIFY_TOKEN is set).
 * Reddit blocks datacenter IPs, so the public endpoints below only succeed
 * from residential proxies — which the actor provides (direct fetch 403s and
 * ScraperAPI standard proxies 500 for Reddit; ScraperAPI residential needs a
 * paid plan). If the actor errors (or no token), fall back to the public
 * search.json directly, then ScraperAPI — same shape as fetchRedditMembers.
 */
export async function searchReddit(keyword: string): Promise<RawLead[]> {
  if (apifyEnabled()) {
    try {
      const posts = await searchRedditViaApify(keyword, 25);
      const mapped: RawLead[] = [];
      for (const p of posts) {
        if (!p.url || !p.title || p.over18) continue;
        mapped.push({
          platform: "reddit",
          postUrl: p.url,
          title: clip(p.title, 300),
          excerpt: clip(p.body, 500),
          author: p.username,
          authorUrl:
            p.username && p.username !== "[deleted]"
              ? `https://www.reddit.com/user/${p.username}`
              : null,
          context: p.communityName ?? "Reddit",
          postedAt: p.createdAt,
          engagement: p.upVotes,
        });
      }
      // A successful run with no matches is a valid "nothing this week" — only
      // a thrown error falls through to the public-endpoint path below.
      return mapped;
    } catch (e) {
      captureBreadcrumb("lead-sources: reddit via apify failed, trying direct", {
        keyword, msg: e instanceof Error ? e.message : "?",
      });
      // fall through to the direct + ScraperAPI path
    }
  }

  const params = new URLSearchParams({
    q: keyword,
    sort: "new",
    t: "week",
    limit: "25",
  });
  const url = `https://www.reddit.com/search.json?${params.toString()}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REDDIT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ISSUEFY_UA, Accept: "application/json" },
      signal: ctl.signal,
    });
    if (res.ok) {
      try {
        return mapRedditListing(await res.json());
      } catch {
        /* not JSON — fall through to ScraperAPI */
      }
    }
  } catch {
    /* network/timeout — fall through to ScraperAPI */
  } finally {
    clearTimeout(t);
  }
  // Fallback via ScraperAPI proxy.
  try {
    const { html } = await standardScrape({ url });
    return mapRedditListing(JSON.parse(html));
  } catch (e) {
    captureBreadcrumb("lead-sources: reddit search failed (direct + fallback)", {
      keyword, msg: e instanceof Error ? e.message : "?",
    });
    return [];
  }
}
