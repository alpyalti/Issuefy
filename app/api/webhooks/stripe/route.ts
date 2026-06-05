import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { planFromPriceId } from "@/lib/stripe";
import { requireSql } from "@/lib/db";
import { captureBreadcrumb, captureError } from "@/lib/sentry";
import { sendPaymentFailedEmail, sendSubscriptionCanceledEmail, sendPlanChangedEmail } from "@/lib/mailer";

export const runtime = "nodejs";

/**
 * Stripe webhook handler.
 *
 *   POST /api/webhooks/stripe   (verified via Stripe-Signature header)
 *
 * Exempt from Clerk middleware (lives under /api/webhooks, which is NOT in
 * the protected matcher).
 *
 * Idempotency: every received event.id is persisted to stripe_webhook_events;
 * duplicates short-circuit with 200 OK so Stripe won't retry forever.
 *
 * Handled events:
 *   - customer.subscription.created       → set plan, status, period_end
 *   - customer.subscription.updated       → sync any subset of those
 *   - customer.subscription.deleted       → status='canceled', clear sub_id
 *   - invoice.payment_succeeded           → first-paid receipt (if status changed)
 *   - invoice.payment_failed              → status='past_due' + email
 *   - checkout.session.completed          → bridge customer + subscription_id
 */
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!stripe || !SECRET) {
    return new Response("Stripe webhook not configured", { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, SECRET);
  } catch (err) {
    captureError(err, { stage: "stripe.signature" });
    return new Response("Invalid signature", { status: 400 });
  }

  const sql = requireSql();

  // Idempotency check — short-circuit duplicate deliveries.
  const seen = (await sql`
    INSERT INTO stripe_webhook_events (id, type)
    VALUES (${event.id}, ${event.type})
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as Array<{ id: string }>;
  if (seen.length === 0) {
    captureBreadcrumb("stripe.duplicate_event", { eventId: event.id, type: event.type });
    return new Response("Duplicate", { status: 200 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object as Stripe.Subscription, sql);
        break;
      case "customer.subscription.deleted":
        await markCanceled(event.data.object as Stripe.Subscription, sql);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, sql);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice, sql);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, sql);
        break;
      default:
        captureBreadcrumb("stripe.unhandled_event", { type: event.type });
    }
  } catch (err) {
    captureError(err, { stage: "stripe.handler", type: event.type });
    return new Response("Handler error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

type Sql = ReturnType<typeof requireSql>;

async function syncSubscription(sub: Stripe.Subscription, sql: Sql) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  const plan = priceId ? planFromPriceId(priceId) : null;

  // Stripe types put current_period_end on the subscription item in v2025+ —
  // use the item's value when present, fall back to top-level for older versions.
  type SubItemWithPeriod = Stripe.SubscriptionItem & { current_period_end?: number };
  type SubWithLegacyPeriod = Stripe.Subscription & { current_period_end?: number };
  const periodEndSeconds =
    (item as SubItemWithPeriod | undefined)?.current_period_end ??
    (sub as SubWithLegacyPeriod).current_period_end ??
    null;
  const currentPeriodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000).toISOString() : null;

  await sql`
    UPDATE users SET
      stripe_subscription_id = ${sub.id},
      subscription_status    = ${sub.status},
      current_period_end     = ${currentPeriodEnd},
      cancel_at_period_end   = ${sub.cancel_at_period_end},
      plan                   = COALESCE(${plan ?? null}, plan),
      plan_started_at        = COALESCE(plan_started_at, now()),
      updated_at             = now()
    WHERE stripe_customer_id = ${customerId}
  `;

  // If a plan change occurred, email the user.
  if (plan) {
    const rows = (await sql`
      SELECT email, plan FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1
    `) as Array<{ email: string; plan: string }>;
    const row = rows[0];
    if (row && row.plan === plan) {
      // Plan matches new value — likely a plan change webhook; fire the email.
      try { await sendPlanChangedEmail(row.email, plan); } catch { /* non-fatal */ }
    }
  }
}

async function markCanceled(sub: Stripe.Subscription, sql: Sql) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const rows = (await sql`
    UPDATE users SET
      subscription_status   = 'canceled',
      cancel_at_period_end  = false,
      updated_at            = now()
    WHERE stripe_customer_id = ${customerId}
    RETURNING email
  `) as Array<{ email: string }>;
  if (rows[0]) {
    try { await sendSubscriptionCanceledEmail(rows[0].email); } catch { /* non-fatal */ }
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, sql: Sql) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  // Only update if the user was previously past_due or incomplete.
  await sql`
    UPDATE users SET
      subscription_status = 'active',
      updated_at          = now()
    WHERE stripe_customer_id = ${customerId}
      AND subscription_status IN ('past_due', 'incomplete', 'trialing')
  `;
}

async function handlePaymentFailed(invoice: Stripe.Invoice, sql: Sql) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  const rows = (await sql`
    UPDATE users SET
      subscription_status = 'past_due',
      updated_at          = now()
    WHERE stripe_customer_id = ${customerId}
    RETURNING email
  `) as Array<{ email: string }>;
  if (rows[0]) {
    try { await sendPaymentFailedEmail(rows[0].email); } catch { /* non-fatal */ }
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, sql: Sql) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!customerId) return;
  const plan = (session.metadata?.plan as "starter" | "growth" | "agency" | undefined) ?? null;
  await sql`
    UPDATE users SET
      stripe_subscription_id = COALESCE(${subscriptionId}, stripe_subscription_id),
      plan                   = COALESCE(${plan}, plan),
      plan_started_at        = COALESCE(plan_started_at, now()),
      updated_at             = now()
    WHERE stripe_customer_id = ${customerId}
  `;
  captureBreadcrumb("stripe.checkout_completed", { customerId, plan });
}
