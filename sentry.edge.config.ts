import { configuredEnv } from "./lib/env";
// Sentry — Edge runtime config (middleware, edge route handlers).
import * as Sentry from "@sentry/nextjs";

const dsn = configuredEnv(process.env.SENTRY_DSN);

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
