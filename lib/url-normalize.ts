/**
 * URL normalization for source dedup (PRD §13.4).
 *
 * Without this, `https://x.com/a`, `https://X.com/a/`, and
 * `https://x.com/a?utm_source=…` would all bypass the (project_id, url)
 * unique constraint and create near-duplicates. We strip the obvious
 * variation surface here so the upsert actually merges.
 *
 * Rules — kept deliberately small so we don't change article identity:
 *   - Force scheme (http://… or bare host) to https://
 *   - Lowercase host
 *   - Drop trailing slash on path (but keep "/" for root)
 *   - Drop fragment
 *   - Drop tracking query params (utm_*, gclid, fbclid, mc_*, igshid, ref, ref_*)
 *   - Sort remaining query params for deterministic ordering
 */

const TRACKING_PARAMS_EXACT = new Set([
  "gclid", "fbclid", "msclkid", "yclid", "dclid", "twclid", "li_fat_id",
  "igshid", "ref", "source", "feature",
]);
const TRACKING_PARAM_PREFIXES = ["utm_", "mc_", "ref_", "_hs", "trk_", "ga_"];

/** Hostname → bare domain (drop leading `www.`). Exported for matching/grouping. */
export function bareDomain(host: string): string {
  const h = host.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

export function normalizeUrl(raw: string): string {
  if (!raw) throw new Error("URL is empty");

  // Tolerate bare domains like "competitor.com/path"
  let input = raw.trim();
  if (!/^https?:\/\//i.test(input)) input = "https://" + input;

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error("Invalid URL: " + raw);
  }

  // Scheme: force https. Public web content is almost always available there,
  // and varying scheme defeats dedup. (We accept the rare http-only edge case.)
  u.protocol = "https:";

  // Host: lowercase + strip www
  u.hostname = bareDomain(u.hostname);

  // Path: strip trailing slash (but keep "/")
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  // Drop fragment
  u.hash = "";

  // Strip tracking params, sort the rest
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    const lower = k.toLowerCase();
    if (TRACKING_PARAMS_EXACT.has(lower)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) continue;
    kept.push([k, v]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // Rebuild the search string deterministically
  const sp = new URLSearchParams();
  for (const [k, v] of kept) sp.append(k, v);
  u.search = sp.toString() ? `?${sp.toString()}` : "";

  return u.toString();
}

/** Quick domain extractor for sources.domain — uses normalizeUrl first. */
export function domainOf(url: string): string {
  try { return bareDomain(new URL(normalizeUrl(url)).hostname); }
  catch { return ""; }
}
