/**
 * Safe canonicalization of USER-SUPPLIED social links.
 *
 * Competitor/company `socials` values are typed by users and later (a) stored,
 * (b) rendered as <a href>, and (c) for youtube/reddit FETCHED SERVER-SIDE by
 * the stats/monitor tiers. Without validation that's a stored-SSRF vector
 * ("youtube": "http://169.254.169.254/…" gets fetched from our egress) and an
 * XSS vector ("website": "javascript:…" rendered as a link).
 *
 * `safeSocialUrl` is the single choke point: it accepts full URLs, scheme-less
 * host paths ("youtube.com/@acme") and bare handles ("@acme", "r/acme",
 * "company/acme"), and returns a canonical https URL whose host is anchored to
 * the platform's real domains — or null when the value can't be made safe.
 * Used by the API schema (reject at write time) AND by every server-side
 * fetcher (protect legacy rows already in the DB).
 */

export type SocialKey =
  | "instagram" | "facebook" | "linkedin" | "x" | "twitter"
  | "youtube" | "tiktok" | "reddit" | "website";

const PLATFORM_HOSTS: Record<Exclude<SocialKey, "website">, { hosts: string[]; canonical: string }> = {
  instagram: { hosts: ["instagram.com", "instagr.am"], canonical: "www.instagram.com" },
  facebook:  { hosts: ["facebook.com", "fb.com", "fb.me"], canonical: "www.facebook.com" },
  linkedin:  { hosts: ["linkedin.com"], canonical: "www.linkedin.com" },
  x:         { hosts: ["x.com", "twitter.com"], canonical: "x.com" },
  twitter:   { hosts: ["x.com", "twitter.com"], canonical: "x.com" },
  youtube:   { hosts: ["youtube.com", "youtu.be"], canonical: "www.youtube.com" },
  tiktok:    { hosts: ["tiktok.com"], canonical: "www.tiktok.com" },
  reddit:    { hosts: ["reddit.com"], canonical: "www.reddit.com" },
};

function hostAllowed(hostname: string, allowed: string[]): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return allowed.some((d) => h === d || h.endsWith("." + d));
}

export function safeSocialUrl(platform: SocialKey, raw: string | null | undefined): string | null {
  const v = (raw || "").trim();
  if (!v || v.length > 300 || /\s/.test(v)) return null;

  const spec = platform === "website" ? null : PLATFORM_HOSTS[platform];

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v);
  const hostLike = !hasScheme && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i.test(v);

  if (hasScheme || hostLike) {
    // Only http(s); everything else (javascript:, data:, ftp:) is rejected.
    if (hasScheme && !/^https?:\/\//i.test(v)) return null;
    let u: URL;
    try { u = new URL(hasScheme ? v : `https://${v}`); } catch { return null; }
    // Userinfo and explicit ports are classic allowlist-bypass tricks.
    if (u.username || u.password || u.port) return null;
    u.protocol = "https:";
    if (spec) {
      if (!hostAllowed(u.hostname, spec.hosts)) return null;
    } else if (!u.hostname.includes(".")) {
      return null; // "website" — any public host, but not localhost/bare names
    }
    u.hash = "";
    return u.toString();
  }

  // Bare handle / path form — build the canonical profile URL ourselves.
  if (!spec) return null; // a website must be an actual URL
  const path = v.replace(/^\/+/, "");
  if (!/^[\w.@~/-]+$/.test(path)) return null;
  return `https://${spec.canonical}/${path}`;
}
