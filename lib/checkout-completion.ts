import { requireSql } from "@/lib/db";
import { stripe, planFromPriceId } from "@/lib/stripe";

export class CheckoutVerificationError extends Error {}
const active = (status: string | null) => !!status && ["active", "trialing", "past_due", "paused"].includes(status);

/** Read-only: webhook owns all entitlement writes. Never trust redirect hints. */
export async function checkoutCompletion(userId: string, sessionId?: string | null) {
  const sql = requireSql();
  const rows = await sql`SELECT stripe_customer_id, stripe_subscription_id, subscription_status, plan, role FROM users WHERE id = ${userId} LIMIT 1`;
  const account = rows[0];
  if (!account) throw new CheckoutVerificationError("Account unavailable");
  if (!stripe || account.role === "admin") return { status: "ready" as const };
  // Old Stripe success URLs carry only upgraded=1. Wait for the own subscription;
  // unrelated team membership is not evidence of completed personal checkout.
  if (!sessionId) return { status: active(account.subscription_status) ? "ready" as const : "pending" as const };
  if (!/^cs_[A-Za-z0-9_]{1,240}$/.test(sessionId)) throw new CheckoutVerificationError("Invalid checkout session");
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (session.mode !== "subscription" || !customerId || customerId !== account.stripe_customer_id ||
      session.metadata?.app_user_id !== userId) {
    throw new CheckoutVerificationError("This checkout does not belong to your account");
  }
  if (session.status === "expired") throw new CheckoutVerificationError("This checkout expired. Choose your plan again.");
  const sub = session.subscription;
  if (session.status !== "complete" || !sub || typeof sub === "string" ||
      !["paid", "no_payment_required"].includes(session.payment_status) || !active(sub.status)) {
    return { status: "pending" as const };
  }
  const plan = planFromPriceId(sub.items.data[0]?.price.id ?? "");
  const period = sub.items.data[0]?.price.recurring?.interval === "year" ? "annual" : "monthly";
  if (!plan) throw new CheckoutVerificationError("Checkout plan is unavailable. Please contact support.");
  const ready = account.stripe_subscription_id === sub.id && active(account.subscription_status) && account.plan === plan;
  return { status: ready ? "ready" as const : "pending" as const, plan, billing: period };
}
