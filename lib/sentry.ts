/**
 * Sentry wrapper — uses the real @sentry/nextjs SDK when SENTRY_DSN is set,
 * otherwise no-ops. The SDK is initialized via sentry.server.config.ts,
 * sentry.client.config.ts, and sentry.edge.config.ts (loaded by
 * instrumentation.ts).
 */
import * as Sentry from "@sentry/nextjs";

type Extra = Record<string, unknown>;

const DSN_SET = !!process.env.SENTRY_DSN;

export function captureError(err: unknown, extra?: Extra) {
  if (!DSN_SET) return;
  Sentry.captureException(err, extra ? { extra } : undefined);
}

export function captureBreadcrumb(message: string, data?: Extra) {
  if (!DSN_SET) return;
  Sentry.addBreadcrumb({ message, data, level: "info" });
}
