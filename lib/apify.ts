/**
 * Apify client — Instagram Profile Scraper (Competitor Hub).
 *
 * Why Apify instead of ScraperAPI for Instagram: IG's anti-bot wall makes
 * direct scraping (even premium+render) unreliable, and in-house
 * authenticated scraping was rejected (ToS breach + single-account ban risk
 * kills the feature for every customer at once). Apify's actor is a
 * commercial pay-per-result product (~$1.60–2.60 / 1,000 profiles) that
 * absorbs the anti-bot and ToS exposure. A maxed Agency project (10
 * competitors × daily) costs well under $1/month.
 *
 * The whole Instagram tier gates on APIFY_TOKEN — unset means fetches are
 * silently skipped (same pattern as the Stripe / R2 clients). Stats-tier
 * platforms (YouTube / Reddit / LinkedIn) don't depend on this module.
 *
 * Endpoint: run-sync-get-dataset-items — runs the actor and returns the
 * dataset in ONE HTTP call. Apify replies 408 if the run exceeds `timeout`
 * (seconds); we set 240s and abort our side at 250s. One batched call with
 * ALL handles for a project is the intended usage (cheaper + simpler than
 * one run per handle).
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
// Tilde form is the actor path on Apify's API ("apify/instagram-profile-scraper").
const ACTOR = process.env.APIFY_IG_ACTOR || "apify~instagram-profile-scraper";
const RUN_TIMEOUT_S = 240;
const HTTP_ABORT_MS = 250_000;

/** True when the Instagram tier is configured. Callers skip IG when false. */
export function apifyEnabled(): boolean {
  return Boolean(APIFY_TOKEN);
}

export interface IgPost {
  /** IG shortcode — stable per post, used as the upsert key. */
  shortCode: string;
  url: string;
  type: string | null;          // Image | Video | Sidecar
  caption: string | null;
  displayUrl: string | null;    // CDN thumbnail (signed, expiring)
  likes: number | null;
  comments: number | null;
  videoViews: number | null;
  postedAt: string | null;      // ISO timestamp
  raw: Record<string, unknown>;
}

export interface IgProfileResult {
  /** Lowercased handle as returned by the actor — match against requested handles. */
  username: string;
  fullName: string | null;
  biography: string | null;
  profilePicUrl: string | null;
  isVerified: boolean | null;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  externalUrl: string | null;
  latestPosts: IgPost[];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Map one raw Apify dataset item to our typed shape. Tolerant of field drift:
 * unknown/missing fields become null rather than throwing, and the full raw
 * post object is preserved for storage in social_posts.raw.
 */
function mapProfile(item: Record<string, unknown>): IgProfileResult | null {
  const username = str(item.username);
  if (!username) return null;

  const rawPosts = Array.isArray(item.latestPosts) ? item.latestPosts : [];
  const latestPosts: IgPost[] = [];
  for (const rp of rawPosts) {
    if (typeof rp !== "object" || rp === null) continue;
    const p = rp as Record<string, unknown>;
    const shortCode = str(p.shortCode) ?? str(p.shortcode) ?? str(p.id);
    if (!shortCode) continue;
    latestPosts.push({
      shortCode,
      url: str(p.url) ?? `https://www.instagram.com/p/${shortCode}/`,
      type: str(p.type),
      caption: str(p.caption),
      displayUrl: str(p.displayUrl),
      likes: num(p.likesCount),
      comments: num(p.commentsCount),
      videoViews: num(p.videoViewCount) ?? num(p.videoPlayCount),
      postedAt: str(p.timestamp),
      raw: p,
    });
  }

  return {
    username: username.toLowerCase(),
    fullName: str(item.fullName),
    biography: str(item.biography),
    profilePicUrl: str(item.profilePicUrlHD) ?? str(item.profilePicUrl),
    isVerified: typeof item.verified === "boolean" ? item.verified : null,
    followers: num(item.followersCount),
    following: num(item.followsCount),
    postsCount: num(item.postsCount),
    externalUrl: str(item.externalUrl),
    latestPosts,
  };
}

/**
 * Fetch one or more Instagram profiles in a single synchronous actor run.
 * Throws on configuration/transport/actor errors (caller fails soft per
 * project); individual unmappable items are dropped, not fatal.
 */
export async function fetchInstagramProfiles(usernames: string[]): Promise<IgProfileResult[]> {
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN is not configured");
  if (usernames.length === 0) return [];

  const params = new URLSearchParams({
    token: APIFY_TOKEN,
    timeout: String(RUN_TIMEOUT_S),
    format: "json",
  });
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?${params.toString()}`;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), HTTP_ABORT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usernames }),
      signal: ctl.signal,
    });
    if (res.status === 408) {
      throw new Error(`Apify run timed out after ${RUN_TIMEOUT_S}s (${usernames.length} handles)`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Apify run failed: ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
    }
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) {
      throw new Error("Apify returned a non-array dataset response");
    }
    const out: IgProfileResult[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      // The actor surfaces per-username errors as items with an `error` field
      // (e.g. private/nonexistent account) — skip those, they're not profiles.
      if ("error" in (item as Record<string, unknown>)) continue;
      const mapped = mapProfile(item as Record<string, unknown>);
      if (mapped) out.push(mapped);
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}
