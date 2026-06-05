/**
 * ScraperAPI — standard URL endpoint + Google Search Structured Data (SERP).
 *
 * PRD §10.7 / §13.3: two roles for ScraperAPI:
 *
 *  1. standardScrape({ url, render })  — fetch raw HTML of a known URL.
 *     `render=true` enables JS rendering and *costs more* on ScraperAPI's
 *     metering, so it defaults to false (PRD §10.7). Same endpoint also
 *     powers website auto-enrichment (PRD §13.11 — counts as one scrape call).
 *
 *  2. serpDiscover(keyword)            — Google Search SDE: keyword → array of
 *     organic result URLs (top N). The ONLY supported keyword → URLs path.
 *
 * Server-side only. Failures are non-fatal at the source layer — the worker
 * logs to scrape_jobs + Sentry and continues with the next URL (PRD §13.2).
 */

const KEY = process.env.SCRAPERAPI_KEY || "";
const TIMEOUT_MS = 25_000;

function ensureKey(): string {
  if (!KEY) throw new Error("SCRAPERAPI_KEY is not configured");
  return KEY;
}

async function fetchWithTimeout(url: string, init?: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Standard endpoint — fetch raw HTML
// ──────────────────────────────────────────────────────────────────────────

export interface StandardScrapeOptions {
  /** Target URL to fetch. */
  url: string;
  /** JS rendering — defaults to false (cheaper). Only enable for SPA-heavy targets. */
  render?: boolean;
  /** Geo target, e.g. "us", "de". Optional. */
  countryCode?: string;
}

export interface StandardScrapeResult {
  /** Raw HTML body returned by ScraperAPI. */
  html: string;
  /** Final URL after redirects, when ScraperAPI exposes it; falls back to input. */
  finalUrl: string;
  /** HTTP status code returned by the target page. */
  status: number;
}

export async function standardScrape(opts: StandardScrapeOptions): Promise<StandardScrapeResult> {
  const key = ensureKey();
  const params = new URLSearchParams({
    api_key: key,
    url: opts.url,
    render: String(opts.render ?? false),
  });
  if (opts.countryCode) params.set("country_code", opts.countryCode);

  const res = await fetchWithTimeout(`https://api.scraperapi.com/?${params.toString()}`);
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`ScraperAPI standard failed: ${res.status} ${res.statusText}`);
  }
  return { html, finalUrl: opts.url, status: res.status };
}

// ──────────────────────────────────────────────────────────────────────────
// Google Search SDE — keyword → organic result URLs
// ──────────────────────────────────────────────────────────────────────────

interface SerpRawOrganic {
  position?: number;
  title?: string;
  link?: string;
  url?: string;
  displayed_link?: string;
  snippet?: string;
}

export interface SerpResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
}

export interface SerpDiscoverOptions {
  query: string;
  /** Geo, default "us". */
  countryCode?: string;
  /** Max organic results to keep (top N). Default 3 per PRD §13.3. */
  topN?: number;
}

export async function serpDiscover(opts: SerpDiscoverOptions): Promise<SerpResult[]> {
  const key = ensureKey();
  const params = new URLSearchParams({
    api_key: key,
    query: opts.query,
    country_code: opts.countryCode ?? "us",
  });

  const res = await fetchWithTimeout(
    `https://api.scraperapi.com/structured/google/search?${params.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`ScraperAPI SERP failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { organic_results?: SerpRawOrganic[] };
  const top = (data.organic_results ?? [])
    .map((r, i): SerpResult => ({
      position: r.position ?? i + 1,
      title: r.title ?? "",
      url: r.link ?? r.url ?? "",
      snippet: r.snippet ?? "",
    }))
    .filter((r) => !!r.url)
    .slice(0, opts.topN ?? 3);
  return top;
}
