// Sentry — browser runtime config.
// Loaded automatically by @sentry/nextjs on the client side.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Production tracing — sample 10% of transactions to control quota.
    tracesSampleRate: 0.1,
    // Session replay (errors only) — captures the seconds before a crash.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
    // No PII leakage from the browser by default.
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
