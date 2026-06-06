// Sentry — Node.js runtime config (route handlers, server actions).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Don't ship request bodies / cookies — they can contain PII or secrets.
    sendDefaultPii: false,
  });
}
