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
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor() { super("Response body exceeds byte limit"); this.name = "ResponseTooLargeError"; }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 25_000,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<Response> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("Invalid response byte limit");
  const ctl = new AbortController();
  // Native deadlines do not keep Node alive. Keep this deadline active after
  // headers arrive so the original Response's body (including clones) is covered.
  // Translate TimeoutError to AbortError to preserve existing catch semantics.
  AbortSignal.timeout(ms).addEventListener("abort", () => ctl.abort(), { once: true });
  const signal = init.signal
    ? AbortSignal.any([init.signal, ctl.signal])
    : ctl.signal;
  const response = await fetch(url, { ...init, signal });
  if (!response.body) return response;
  const reader = response.body.getReader();
  const tooLarge = () => {
    const error = new ResponseTooLargeError();
    void reader.cancel(error).catch(() => {});
    ctl.abort(error);
    return error;
  };
  // Content-Length is only an early rejection hint. Count actual decoded
  // bytes too: chunked/compressed/misreported payloads must obey the same cap.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  let bytes = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) { controller.close(); return; }
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) { controller.error(tooLarge()); return; }
        controller.enqueue(chunk.value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  // Native body readers/clone remain available. Preserve network metadata
  // that the Response constructor does not copy from the original response.
  const metadata = (bounded: Response): Response => {
    const clone = bounded.clone.bind(bounded);
    Object.defineProperties(bounded, {
      url: { value: response.url }, redirected: { value: response.redirected },
      type: { value: response.type }, clone: { value: () => metadata(clone()) },
    });
    return bounded;
  };
  return metadata(new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }));
}
