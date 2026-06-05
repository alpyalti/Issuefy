import Stripe from "stripe";

/**
 * Stripe SDK client (server-only).
 *
 * Loads STRIPE_SECRET_KEY at module init. When unset, `stripe` is null and all
 * billing routes return 501 (Sprint C and onward gracefully degrades during
 * dev/testing without keys).
 */
const KEY = process.env.STRIPE_SECRET_KEY;

export const stripe = KEY
  ? new Stripe(KEY, {
      // Use the SDK's default API version (bound to the installed stripe pkg)
      typescript: true,
      appInfo: { name: "Issuefy", version: "0.1.0" },
    })
  : null;

export function requireStripe(): Stripe {
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
  return stripe;
}

export type PlanId = "starter" | "growth" | "agency";
export type BillingPeriod = "monthly" | "annual";

const ENV_KEY: Record<PlanId, Record<BillingPeriod, string>> = {
  starter: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", annual: "STRIPE_PRICE_STARTER_ANNUAL" },
  growth:  { monthly: "STRIPE_PRICE_GROWTH_MONTHLY",  annual: "STRIPE_PRICE_GROWTH_ANNUAL" },
  agency:  { monthly: "STRIPE_PRICE_AGENCY_MONTHLY",  annual: "STRIPE_PRICE_AGENCY_ANNUAL" },
};

/** Resolve a (plan, billing) tuple to its Stripe Price ID via env. */
export function getPriceId(plan: PlanId, billing: BillingPeriod): string | null {
  const k = ENV_KEY[plan]?.[billing];
  return (k && process.env[k]) || null;
}

/** Map a Stripe Price ID back to our internal plan name (used by webhook). */
export function planFromPriceId(priceId: string): PlanId | null {
  for (const plan of Object.keys(ENV_KEY) as PlanId[]) {
    for (const billing of ["monthly", "annual"] as const) {
      if (process.env[ENV_KEY[plan][billing]] === priceId) return plan;
    }
  }
  return null;
}
