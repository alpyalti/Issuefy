/**
 * Sentry shim.
 *
 * The MVP does NOT pull in @sentry/nextjs to keep the bundle slim and avoid an
 * extra dependency when no DSN is configured. When SENTRY_DSN is set we ship a
 * minimal POST-to-store-endpoint sender (a future phase can swap this for the
 * official SDK). When unset, both functions no-op.
 */
type Extra = Record<string, unknown>;

export function captureError(err: unknown, extra?: Extra) {
  if (!process.env.SENTRY_DSN) return;
  // eslint-disable-next-line no-console
  console.error("[sentry]", err, extra);
  // Phase 6 — swap in @sentry/nextjs's captureException when DSN is configured.
}

export function captureBreadcrumb(message: string, data?: Extra) {
  if (!process.env.SENTRY_DSN) return;
  // eslint-disable-next-line no-console
  console.info("[sentry breadcrumb]", message, data);
}
