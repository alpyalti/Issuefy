/**
 * fetchWithTimeout — the shared deadline for fetching headers and consuming
 * the response body. Before this, the identical block was
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
  // Native deadlines do not keep Node alive. Keep this deadline active after
  // headers arrive so the original Response's body (including clones) is covered.
  // Translate TimeoutError to AbortError to preserve existing catch semantics.
  AbortSignal.timeout(ms).addEventListener("abort", () => ctl.abort(), { once: true });
  const signal = init.signal
    ? AbortSignal.any([init.signal, ctl.signal])
    : ctl.signal;
  return fetch(url, { ...init, signal });
}
