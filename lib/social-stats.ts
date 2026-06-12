/**
 * Stats-tier social parsers (Competitor Hub).
 *
 * Instagram gets the rich Apify path (lib/apify.ts). The other platforms get
 * follower/subscriber/member counts via paths we already pay for or that are
 * free:
 *
 *   YouTube   parse subscriber count out of the channel page HTML fetched via
 *             the standard ScraperAPI endpoint (1 scrape-budget tick)
 *   Reddit    public about.json — free, no ScraperAPI
 *   LinkedIn  regex over the cleaned text of the weekly premium scrape we
 *             ALREADY store in sources — zero new cost
 *
 * Every parser fails soft to null — the hub shows "—" rather than fake data.
 */

/** "1.2M" / "850K" / "12,345" / "1.234.567" → integer, or null. */
export function parseCompactCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, "");
  const m = s.match(/^([\d.,]+)([KMB])?$/i);
  if (!m) return null;
  const suffix = (m[2] || "").toUpperCase();
  let numPart = m[1];
  if (suffix) {
    // "1.2M" — dot is a decimal separator.
    numPart = numPart.replace(/,/g, "");
    const f = parseFloat(numPart);
    if (!Number.isFinite(f)) return null;
    const mult = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : 1_000_000_000;
    return Math.round(f * mult);
  }
  // Plain number — strip thousands separators (both , and . styles). A value
  // like "1.234" is ambiguous; treat separators as grouping when there are
  // multiple groups, else drop them anyway (follower counts aren't fractional).
  const digits = numPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  return parseInt(digits, 10);
}

/** instagram.com/nike/ · @nike · nike → "nike". Null for non-handle URLs. */
export function parseInstagramHandle(raw: string): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  s = s.replace(/^@/, "");
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (/^instagram\.com\//i.test(s)) s = s.replace(/^instagram\.com\//i, "");
  s = s.split(/[/?#]/)[0].trim();
  // Reserved paths that aren't profiles.
  if (!s || ["p", "reel", "reels", "explore", "stories", "accounts"].includes(s.toLowerCase())) return null;
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return null;
  return s.toLowerCase();
}

/**
 * Extract the subscriber count from a YouTube channel page's HTML.
 * Strategy 1: `"subscriberCountText"` inside the embedded ytInitialData JSON
 * ("1.23M subscribers"). Strategy 2: og:description meta, which sometimes
 * carries the same phrasing. Layout changes break this — callers treat null
 * as "unknown", never as zero.
 */
export function parseYouTubeSubscribers(html: string): number | null {
  // e.g. "subscriberCountText":{"simpleText":"1.23M subscribers"}
  const m1 = html.match(/"subscriberCountText"\s*:\s*\{[^}]*?"simpleText"\s*:\s*"([^"]+?)\s+subscribers?"/i);
  if (m1) {
    const n = parseCompactCount(m1[1]);
    if (n !== null) return n;
  }
  // e.g. "subscriberCountText":{"accessibility":...,"runs":[{"text":"1.23M"},{"text":" subscribers"}]}
  const m2 = html.match(/"subscriberCountText"[\s\S]{0,200}?"text"\s*:\s*"([\d.,]+\s*[KMB]?)"/i);
  if (m2) {
    const n = parseCompactCount(m2[1]);
    if (n !== null) return n;
  }
  // og/meta fallback: content="… 1.23M subscribers …"
  const m3 = html.match(/([\d.,]+\s*[KMB]?)\s+subscribers/i);
  if (m3) {
    const n = parseCompactCount(m3[1]);
    if (n !== null) return n;
  }
  return null;
}

const REDDIT_TIMEOUT_MS = 15_000;

/**
 * Subscriber/member count for a subreddit (or follower count for a user
 * profile) via Reddit's public about.json. Free — no ScraperAPI, no budget
 * tick. Same UA trick as lib/social-monitor.ts (default UAs get 429/blank).
 */
export async function fetchRedditMembers(redditUrl: string): Promise<number | null> {
  const base = (redditUrl || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const url = `${base}/about.json`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REDDIT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "issuefy-monitor/1.0 (+https://issuefy.app)",
        Accept: "application/json",
      },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { subscribers?: number; total_karma?: number } };
    const subs = data?.data?.subscribers;
    return typeof subs === "number" && Number.isFinite(subs) ? subs : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Follower count from the cleaned text of an already-stored LinkedIn company
 * page scrape ("Acme Corp | 12,345 followers on LinkedIn …"). Zero new
 * scrape cost — we ride the weekly premium scrape that social-monitor already
 * performs and stores in `sources`.
 */
export function parseLinkedInFollowers(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/([\d.,]+\s*[KMB]?)\s+followers/i);
  if (!m) return null;
  return parseCompactCount(m[1]);
}
