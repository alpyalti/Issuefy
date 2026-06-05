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
  | "youtube" | "tiktok" | "website";

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

// Map a social URL to a (platform, value) pair, or null if not a social link.
function classifySocial(href: string): [SocialPlatform, string] | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  const host = bareDomain(u.hostname);
  const path = u.pathname.replace(/\/+$/, "");
  // Reject root-only links (e.g. "https://facebook.com/") which add no value.
  const hasHandle = path.length > 1;
  if ((host === "instagram.com" || host === "instagr.am") && hasHandle) return ["instagram", u.toString()];
  if ((host === "facebook.com" || host === "fb.com") && hasHandle) return ["facebook", u.toString()];
  if ((host === "linkedin.com") && /\/(company|in|school)\//i.test(path)) return ["linkedin", u.toString()];
  if ((host === "x.com" || host === "twitter.com") && hasHandle) return ["x", u.toString()];
  if ((host === "youtube.com" || host === "youtu.be") && hasHandle) return ["youtube", u.toString()];
  if (host === "tiktok.com" && hasHandle) return ["tiktok", u.toString()];
  return null;
}

function extractSocials(html: string, base: string): Partial<Record<SocialPlatform, string>> {
  const out: Partial<Record<SocialPlatform, string>> = {};
  // Match every anchor href, then classify.
  const re = /<a[^>]*\shref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = absolutize(m[1], base);
    if (!abs) continue;
    const c = classifySocial(abs);
    if (!c) continue;
    const [platform, val] = c;
    if (!out[platform]) out[platform] = val;
  }
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
