import type Stripe from "stripe";
import { expectedBillingLivemode } from "@/lib/billing-mode";
import { requireSql } from "@/lib/db";
import { stripe, planFromPriceId } from "@/lib/stripe";

export class CheckoutVerificationError extends Error {}
const active = (status: string | null) => !!status && ["active", "trialing", "past_due", "paused"].includes(status);

/** Reject wrong-mode hints and invalid config before authentication can upsert a user. */
export function assertCheckoutCompletionMode(sessionId?: string | null): boolean {
  const live = expectedBillingLivemode();
  if (sessionId && (!/^cs_(live|test)_[A-Za-z0-9_]{1,240}$/.test(sessionId) ||
      !sessionId.startsWith(live ? "cs_live_" : "cs_test_"))) {
    throw new CheckoutVerificationError("Checkout session mode mismatch");
  }
  return live;
}

/** Fetch and strictly verify provider modes before any account read or lazy upsert. */
export async function prepareCheckoutCompletion(sessionId?: string | null) {
  const live = assertCheckoutCompletionMode(sessionId);
  if (!stripe) throw new Error("Billing is not configured");
  if (!sessionId) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const sub = session.subscription;
  if (session.id !== sessionId || session.livemode !== live ||
      (sub && (typeof sub === "string" || sub.livemode !== live))) {
    throw new CheckoutVerificationError("Checkout session mode mismatch");
  }
  return session;
}

/** Read-only: webhook owns all entitlement writes. Never trust redirect hints. */
export async function checkoutCompletion(userId: string, sessionId?: string | null, prepared?: Stripe.Checkout.Session | null) {
  const live = assertCheckoutCompletionMode(sessionId);
  const session = prepared === undefined ? await prepareCheckoutCompletion(sessionId) : prepared;
  // Defense in depth for callers supplying a preflight result.
  if (session && (session.id !== sessionId || session.livemode !== live ||
      (session.subscription && (typeof session.subscription === "string" || session.subscription.livemode !== live)))) {
    throw new CheckoutVerificationError("Checkout session mode mismatch");
  }
  if (sessionId && !session) throw new CheckoutVerificationError("Checkout session unavailable");
  const sql = requireSql();
  const rows = await sql`SELECT stripe_customer_id, stripe_subscription_id, subscription_status, plan, role FROM users WHERE id = ${userId} LIMIT 1`;
  const account = rows[0];
  if (!account) throw new CheckoutVerificationError("Account unavailable");
  if (account.role === "admin") return { status: "ready" as const };
  // Legacy returns wait for the own subscription; hints never confer entitlement.
  if (!session) return { status: active(account.subscription_status) ? "ready" as const : "pending" as const };
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
