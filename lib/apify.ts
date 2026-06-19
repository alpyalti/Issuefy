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
// Reddit Scraper Lite — used by Lead Discovery. Reddit blocks datacenter IPs
// outright (direct fetch 403; ScraperAPI standard proxies 500) and residential
// proxies need a paid ScraperAPI plan, so this pay-per-result actor (~$3.40 /
// 1,000 results) is how Reddit leads actually come through.
const REDDIT_ACTOR = process.env.APIFY_REDDIT_ACTOR || "trudax~reddit-scraper-lite";
const RUN_TIMEOUT_S = 240;
// Reddit runs are short — cap them low so a proxy-blocked run fails fast and we
// retry on a fresh IP instead of hanging near the worker's 300s ceiling.
const REDDIT_RUN_TIMEOUT_S = 80;
const REDDIT_MAX_ATTEMPTS = 2;

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
 * Run an actor synchronously and return its dataset items in ONE HTTP call
 * (run-sync-get-dataset-items). Throws on config/transport/actor/timeout
 * errors so callers can fail soft. `input` is the actor's input object,
 * POSTed as the request body.
 */
async function runActorSync(actor: string, input: unknown, timeoutS = RUN_TIMEOUT_S): Promise<unknown[]> {
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN is not configured");
  const params = new URLSearchParams({
    token: APIFY_TOKEN,
    timeout: String(timeoutS),
    format: "json",
  });
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?${params.toString()}`;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutS * 1000 + 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: ctl.signal,
    });
    if (res.status === 408) {
      throw new Error(`Apify run timed out after ${RUN_TIMEOUT_S}s (${actor})`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Apify run failed: ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
    }
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) {
      throw new Error("Apify returned a non-array dataset response");
    }
    return items;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch one or more Instagram profiles in a single synchronous actor run.
 * Throws on configuration/transport/actor errors (caller fails soft per
 * project); individual unmappable items are dropped, not fatal.
 */
export async function fetchInstagramProfiles(usernames: string[]): Promise<IgProfileResult[]> {
  if (usernames.length === 0) return [];
  const items = await runActorSync(ACTOR, { usernames });
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
}

// ──────────────────────────────────────────────────────────────────────────
// Reddit Scraper Lite — keyword post search for Lead Discovery
// ──────────────────────────────────────────────────────────────────────────

export interface ApifyRedditPost {
  url: string | null;
  title: string | null;
  body: string | null;            // selftext
  username: string | null;        // author handle
  communityName: string | null;   // already "r/SaaS" form
  createdAt: string | null;        // ISO timestamp
  upVotes: number | null;
  numberOfComments: number | null;
  over18: boolean;
}

/**
 * Search recent Reddit POSTS for a keyword via Reddit Scraper Lite. Posts only
 * (no comments/communities/users), newest first, last week, capped at
 * `maxItems` (also the billing cap — this actor is pay-per-result). Throws when
 * APIFY_TOKEN is unset so searchReddit() can fall back to its direct path.
 */
export async function searchRedditViaApify(keyword: string, maxItems = 25): Promise<ApifyRedditPost[]> {
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN is not configured");
  const input = {
    searches: [keyword],
    searchPosts: true,
    searchComments: false,
    searchCommunities: false,
    searchUsers: false,
    skipComments: true,
    sort: "new",
    time: "week",
    maxItems,
    maxPostCount: maxItems,
    includeNSFW: false,
    // NB: the default post output has NO upVotes/numberOfComments, and the
    // `includeMediaLinks` flag that's meant to add them reliably returns 0
    // results (tested twice) — so Reddit leads carry engagement: null. Posts
    // come through fine without it (~13/15; the rest are community rows we drop).
    proxy: { useApifyProxy: true },
  };
  // Reddit blocks the actor's datacenter proxies intermittently → a run comes
  // back empty (status 201, 0 items) or errors (400/timeout). Both are cheap to
  // retry — pay-per-result means a 0-result run costs $0, and a fresh attempt
  // gets a new proxy IP. Short per-run timeout so a blocked run fails fast.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= REDDIT_MAX_ATTEMPTS; attempt++) {
    try {
      const items = await runActorSync(REDDIT_ACTOR, input, REDDIT_RUN_TIMEOUT_S);
      const posts = mapRedditItems(items);
      if (posts.length > 0 || attempt === REDDIT_MAX_ATTEMPTS) return posts;
    } catch (e) {
      lastErr = e;
      if (attempt === REDDIT_MAX_ATTEMPTS) throw e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

/** Map raw actor dataset items → typed posts (drops communities/errors/no-url). */
function mapRedditItems(items: unknown[]): ApifyRedditPost[] {
  const out: ApifyRedditPost[] = [];
  for (const it of items) {
    if (typeof it !== "object" || it === null) continue;
    const p = it as Record<string, unknown>;
    // Skip non-post rows (the actor can emit info/no-result items) + errors.
    if ("error" in p) continue;
    if (p.dataType != null && p.dataType !== "post") continue;
    const url = str(p.url);
    if (!url) continue;
    const community = str(p.communityName);
    out.push({
      url,
      title: str(p.title),
      body: str(p.body),
      username: str(p.username),
      communityName: community
        ? (community.startsWith("r/") ? community : `r/${community}`)
        : null,
      createdAt: str(p.createdAt),
      upVotes: num(p.upVotes),
      numberOfComments: num(p.numberOfComments),
      over18: p.over18 === true,
    });
  }
  return out;
}
