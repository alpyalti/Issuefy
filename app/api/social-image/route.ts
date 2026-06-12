import { captureBreadcrumb } from "@/lib/sentry";

export const runtime = "nodejs";

/**
 * Image proxy for Instagram / Facebook CDN media (Competitor Hub).
 *
 *   GET /api/social-image?u=<encoded CDN url>
 *
 * Why: Instagram serves avatars + post thumbnails from scontent-*.cdninstagram.com
 * / *.fbcdn.net with signed, hotlink-protected URLs. A browser <img> loading
 * them cross-origin gets a 403 (referrer/CORS wall), so they render broken.
 * Fetching server-side sidesteps that — there's no browser referrer, and we
 * re-serve the bytes from our own origin.
 *
 * Security: this is a public route (images load without auth), so it's a
 * potential SSRF / open-proxy vector. We hard-allowlist the host to Instagram
 * + Facebook CDN domains only, and only proxy image content types.
 *
 * Expiry: the signed URLs lapse after a number of hours. The daily refresh
 * re-fetches fresh URLs, so same-day loads work; a stale URL returns a 404
 * here and the client's onError fallback shows a placeholder. (R2 mirroring
 * for permanence is a future upgrade.)
 */
const ALLOWED_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
const FETCH_TIMEOUT_MS = 12_000;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u");
  if (!raw) return new Response("Missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
    return new Response("Forbidden host", { status: 403 });
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // No Referer — that's the whole point. A browser-ish UA + Accept
        // keeps the CDN happy.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: ctl.signal,
      redirect: "follow",
    });
    if (!upstream.ok) {
      return new Response("Upstream error", { status: 404 });
    }
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new Response("Not an image", { status: 415 });
    }
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": contentType,
        // Cache hard at the edge + browser — the underlying image is immutable
        // for the life of the signed URL.
        "cache-control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch (e) {
    captureBreadcrumb("social-image proxy failed", { host: target.hostname, msg: e instanceof Error ? e.message : "?" });
    return new Response("Fetch failed", { status: 404 });
  } finally {
    clearTimeout(timer);
  }
}
