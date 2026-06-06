/**
 * Website auto-enrichment (PRD §13.11).
 *
 * Given a website URL, fetch the homepage via the standard ScraperAPI endpoint
 * (one scrape call against the budget), then DOM/regex-parse the HTML for:
 *
 *   - name         from og:site_name, <title>, or the domain
 *   - description  from meta description or og:description
 *   - logo_url     from og:image, apple-touch-icon, or favicon
 *   - socials      from anchor href scan + URL pattern match across
 *                  Instagram / Facebook / X (Twitter) / LinkedIn / YouTube / TikTok
 *
 * This is deterministic regex parsing — no OpenRouter call needed (cheap).
 * Failure handling: returns a partial profile with whatever was found so the
 * UI can fall back to manual editing. Onboarding never blocks.
 *
 * Caches successful enrichments in-memory for 10 minutes so users navigating
 * back and forth on the confirm screen don't re-spend a scrape call.
 */
import { standardScrape } from "./scraperapi";
import { bareDomain, normalizeUrl } from "./url-normalize";
import { decodeEntities } from "./cleaner";

export type SocialPlatform =
  | "instagram" | "facebook" | "linkedin" | "x" | "twitter"
  | "youtube" | "tiktok" | "reddit" | "website";

export interface EnrichmentProfile {
  name: string;
  description: string;
  logo_url: string | null;
  socials: Partial<Record<SocialPlatform, string>>;
  source_url: string;
  status: "enriched" | "failed" | "manual";
}

// ──────────────────────────────────────────────────────────────────────────
// HTML feature extractors
// ──────────────────────────────────────────────────────────────────────────

function metaContent(html: string, propertyOrName: string): string {
  // Matches <meta property="og:title" content="…"> and the name= variant.
  // Avoids a real DOM parser by using a non-greedy regex; good enough for
  // the head of a homepage.
  const re = new RegExp(
    `<meta\\s+[^>]*?(?:property|name)\\s*=\\s*["']${propertyOrName}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const m = re.exec(html);
  return m ? decodeEntities(m[1]).trim() : "";
}

function titleTag(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).trim() : "";
}

function linkHref(html: string, rel: string): string {
  const re = new RegExp(
    `<link\\s+[^>]*?rel\\s*=\\s*["'][^"']*${rel}[^"']*["'][^>]*?href\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const m = re.exec(html);
  return m ? m[1].trim() : "";
}

function absolutize(maybeUrl: string, base: string): string {
  if (!maybeUrl) return "";
  try { return new URL(maybeUrl, base).toString(); } catch { return ""; }
}

// First non-empty path segment, lowercased. "/company/acme" → "company".
function firstSegment(path: string): string {
  return path.replace(/^\/+/, "").split("/")[0]?.toLowerCase() || "";
}

// Path segments that are share buttons / generic pages, never a profile.
const NON_PROFILE_SEGMENTS = new Set([
  "sharer", "sharer.php", "share", "sharearticle", "intent", "dialog",
  "login", "signup", "home", "privacy", "policies", "tos", "terms", "help",
  "watch", "embed", "search", "hashtag", "explore",
]);

// Strip fragments + tracking params but keep meaningful ones (e.g. the
// `?id=` on facebook.com/profile.php). Returns a clean canonical profile URL.
function cleanSocialUrl(u: URL): string {
  u.hash = "";
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    const lk = k.toLowerCase();
    if (lk.startsWith("utm_") || ["fbclid", "igshid", "ref", "ref_src", "ref_url", "mibextid", "_rdr"].includes(lk)) continue;
    kept.push([k, v]);
  }
  const sp = new URLSearchParams(kept);
  u.search = sp.toString() ? `?${sp.toString()}` : "";
  return u.toString();
}

// Map a social URL to a (platform, value) pair, or null if not a social link.
// Host matching uses suffix tests so subdomains (de.linkedin.com, m.facebook.com,
// old.reddit.com) all resolve correctly. bareDomain() already strips a leading www.
function classifySocial(href: string): [SocialPlatform, string] | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  const host = bareDomain(u.hostname);
  const is = (d: string) => host === d || host.endsWith("." + d);
  const path = u.pathname.replace(/\/+$/, "");
  // Reject root-only links (e.g. "https://facebook.com/") which add no value.
  const hasHandle = path.length > 1;
  if (!hasHandle) return null;
  const seg = firstSegment(path);
  if (NON_PROFILE_SEGMENTS.has(seg)) return null;
  const clean = cleanSocialUrl(u);

  if ((is("instagram.com") || is("instagr.am"))) return ["instagram", clean];
  if ((is("facebook.com") || is("fb.com") || is("fb.me"))) return ["facebook", clean];
  // LinkedIn: accept any handle path (company / in / school / showcase / etc.),
  // not just the previously-required /company|in|school/ — that strict pattern
  // was the main reason valid footer links were missed.
  if (is("linkedin.com")) return ["linkedin", clean];
  if ((is("x.com") || is("twitter.com")) && !["i", "intent", "share", "home", "hashtag", "search"].includes(seg)) return ["x", clean];
  if ((is("youtube.com") || is("youtu.be"))) return ["youtube", clean];
  if (is("tiktok.com")) return ["tiktok", clean];
  if (is("reddit.com") && /^\/(r|user|u)\//i.test(u.pathname)) return ["reddit", clean];
  return null;
}

function extractSocials(html: string, base: string): Partial<Record<SocialPlatform, string>> {
  const out: Partial<Record<SocialPlatform, string>> = {};
  const consider = (raw: string) => {
    const abs = absolutize(raw, base);
    if (!abs) return;
    const c = classifySocial(abs);
    if (!c) return;
    const [platform, val] = c;
    if (!out[platform]) out[platform] = val; // first match per platform wins
  };

  // Pass 1 — anchor hrefs. Cleanest signal: footer/nav social icon links.
  const anchorRe = /<a[^>]*\shref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) consider(m[1]);

  // Pass 2 — any social URL anywhere in the raw HTML, even outside a clean
  // <a href>. Catches JSON-LD `sameAs`, data-* attributes, inline JSON and
  // icon lists that the anchor scan misses. Only fills gaps Pass 1 left (the
  // `if (!out[platform])` guard). Candidate set is pre-filtered to the known
  // social hosts; classifySocial then validates each via new URL().
  const urlRe = /https?:\/\/[^\s"'<>\\),\]}]*(?:instagram|instagr\.am|facebook|fb\.com|fb\.me|linkedin|x\.com|twitter|youtube|youtu\.be|tiktok|reddit)[^\s"'<>\\),\]}]*/gi;
  while ((m = urlRe.exec(html))) consider(m[0]);

  return out;
}

function nameFromDomain(host: string): string {
  const base = bareDomain(host).split(".")[0] || host;
  return base.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ──────────────────────────────────────────────────────────────────────────
// Public API + cache
// ──────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1_000; // 10 minutes
const cache = new Map<string, { at: number; profile: EnrichmentProfile }>();

export function clearEnrichmentCache() { cache.clear(); }

/**
 * Fetch + parse a homepage. ALWAYS returns a profile (possibly with empty
 * fields and status="failed"); never throws to the caller.
 */
export async function enrichWebsite(rawUrl: string): Promise<EnrichmentProfile> {
  const url = normalizeUrl(rawUrl);
  const host = new URL(url).hostname;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.profile;

  // Build an "empty manual" fallback up front so we always have something to return.
  const fallback: EnrichmentProfile = {
    name: nameFromDomain(host),
    description: "",
    logo_url: null,
    socials: { website: url },
    source_url: url,
    status: "failed",
  };

  let html = "";
  try {
    const res = await standardScrape({ url });
    html = res.html;
  } catch {
    return fallback;
  }
  if (!html) return fallback;

  const name =
    metaContent(html, "og:site_name").trim() ||
    titleTag(html).trim() ||
    nameFromDomain(host);

  const description =
    metaContent(html, "og:description").trim() ||
    metaContent(html, "description").trim();

  const logo_url =
    absolutize(metaContent(html, "og:image"), url) ||
    absolutize(linkHref(html, "apple-touch-icon"), url) ||
    absolutize(linkHref(html, "icon"), url) ||
    absolutize(linkHref(html, "shortcut icon"), url) ||
    null;

  const socials = { website: url, ...extractSocials(html, url) };

  const profile: EnrichmentProfile = {
    name: name || nameFromDomain(host),
    description: description.slice(0, 600),
    logo_url,
    socials,
    source_url: url,
    status: "enriched",
  };

  cache.set(url, { at: Date.now(), profile });
  return profile;
}
