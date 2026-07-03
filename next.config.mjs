import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence the "multiple lockfiles" warning by pinning the workspace root.
  turbopack: { root: __dirname },
  images: {
    // Allow remote logos discovered during website enrichment (og:image / favicons).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Baseline security headers on every response. HSTS is added by Vercel
  // automatically; CSP is deliberately absent for now (Clerk + Stripe +
  // inline styles make a strict policy its own project).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// Wrap with Sentry — uploads source maps at build time (silent in CI) and
// instruments the Next router. Only active when SENTRY_AUTH_TOKEN + DSN are set;
// otherwise builds cleanly without trying to upload.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "issuefy",
  project: process.env.SENTRY_PROJECT || "issuefy",
  // Suppress non-error logs during build
  silent: !process.env.CI,
  // Upload source maps for clearer stack traces. Requires SENTRY_AUTH_TOKEN.
  widenClientFileUpload: true,
  // Hide source maps from public URLs.
  hideSourceMaps: true,
  // Skip source map uploads when no auth token (local builds, preview deploys).
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
