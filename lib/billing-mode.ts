/**
 * Existing databases, including Preview, contain production data. A test key
 * alone never authorizes test writes. Set isolated_test only after provisioning
 * separate database/auth/provider resources; never on the shared Preview.
 */
export function expectedBillingLivemode(): boolean {
  const environment = process.env.BILLING_DATA_ENVIRONMENT ?? "production";
  const isolated = environment === "isolated_test" && process.env.VERCEL_ENV !== "production";
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const keyMatches = isolated ? /^(sk|rk)_test_/.test(key) : /^(sk|rk)_live_/.test(key);
  if ((!isolated && environment !== "production") || !keyMatches) {
    throw new Error("Stripe billing environment mismatch");
  }
  return !isolated;
}
