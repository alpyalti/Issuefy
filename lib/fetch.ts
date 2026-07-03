/**
 * fetchWithTimeout — the one place the AbortController + setTimeout +
 * clearTimeout-in-finally dance lives. Before this, the identical block was
 * hand-rolled in nine fetchers (scraperapi, apify, openrouter, social-stats,
 * social-monitor, lead-sources, the social-image proxy); a timer-leak or
 * signal bug meant nine fixes.
 *
 * Throws the fetch's own AbortError on timeout — callers keep their existing
 * catch semantics (most fail soft to null/[]).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 25_000,
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
