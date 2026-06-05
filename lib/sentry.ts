/**
 * Sentry shim — graceful no-op when @sentry/nextjs isn't installed or the DSN
 * isn't configured. Real Sentry integration can be added later by:
 *
 *   1. `npm install @sentry/nextjs`
 *   2. Setting SENTRY_DSN
 *   3. Replacing the captureError/captureBreadcrumb bodies below with
 *      `Sentry.captureException(err, { extra })` and
 *      `Sentry.addBreadcrumb({ message, data })`.
 *
 * When DSN is set, we surface errors via console.error so they appear in
 * Vercel logs at minimum — better than silent drops.
 */
type Extra = Record<string, unknown>;

const DSN_SET = !!process.env.SENTRY_DSN;

export function captureError(err: unknown, extra?: Extra) {
  if (!DSN_SET) return;
  // eslint-disable-next-line no-console
  console.error("[sentry]", err instanceof Error ? err.stack || err.message : err, extra ?? {});
}

export function captureBreadcrumb(message: string, data?: Extra) {
  if (!DSN_SET) return;
  // eslint-disable-next-line no-console
  console.info("[sentry breadcrumb]", message, data ?? {});
}
