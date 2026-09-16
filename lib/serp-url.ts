import { isIP } from "node:net";
import { safeSocialUrl } from "./social-url";

const GOOGLE_HOSTS = new Set(["google.com", "www.google.com"]);
function isGoogleRedirect(url: URL): boolean {
  return GOOGLE_HOSTS.has(url.hostname) && (url.pathname === "/goto" || url.pathname === "/url");
}

/** No network resolution or redirect following. Apply existing website validation
 * plus conservative source-only hostname checks (literal IPs/local names excluded).
 * This does not assert DNS/redirect-chain safety at the eventual fetch boundary. */
function publicWebsite(raw: string): URL | null {
  if (!/^https?:\/\//i.test(raw) || /[\\\s]/.test(raw) || /%(?![0-9a-f]{2})/i.test(raw)) return null;
  const safe = safeSocialUrl("website", raw);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.replace(/\.$/, "");
  if (isIP(host) || host.includes(":")) return null;
  if (!host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(host)) return null;
  url.hostname = host;
  return url;
}

/** Unwrap only established Google result wrappers, with one query decoding pass.
 * Observed opaque Google goto tokens remain unresolved wrappers. Unsafe explicit
 * destinations are discarded; no token decoding or network expansion is attempted.
 * Ordinary publisher URLs are never inspected for redirect-like query parameters. */
export function serpPublisherUrl(raw: string): string | null {
  const outer = publicWebsite(raw);
  if (!outer) return null;
  if (!isGoogleRedirect(outer)) return outer.toString();
  const keys = outer.pathname === "/goto" ? ["url"] : ["url", "q"];
  const destinations = keys.flatMap((key) => outer.searchParams.getAll(key));
  if (destinations.length !== 1) return null;
  // Google also emits opaque encoded tokens (observed CAES/base64url shape).
  // Their publisher cannot be inferred locally. Preserve the validated wrapper
  // rather than silently dropping the result or inventing a publisher identity.
  if (outer.pathname === "/goto" && /^CAES[A-Za-z0-9_-]{20,}$/.test(destinations[0])) {
    return outer.toString();
  }
  // URLSearchParams already decoded the enclosing query. Never decode again:
  // a double-encoded scheme must fail, while article path escapes remain intact.
  const destination = publicWebsite(destinations[0]);
  // Google is not a publisher destination for this wrapper. Reject all such
  // hops, including alternate/encoded redirect paths, rather than recurse.
  if (!destination || GOOGLE_HOSTS.has(destination.hostname)) return null;
  return destination.toString();
}
