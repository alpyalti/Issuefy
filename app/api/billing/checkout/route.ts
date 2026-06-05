import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { stripe, requireStripe, getPriceId, type PlanId, type BillingPeriod } from "@/lib/stripe";
import { json, parseJson, rateLimited } from "@/lib/api";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["starter", "growth", "agency"]),
  billing: z.enum(["monthly", "annual"]),
}).strict();

/**
 * POST /api/billing/checkout — start a Stripe Checkout session for the
 * selected plan + billing period. Card upfront, 14-day trial (Stripe handles
 * the $0-today UX). On success the user lands on /dashboard via
 * success_url; on cancel they return to /upgrade.
 *
 * Reuses the user's stripe_customer_id when present; otherwise creates one
 * on first checkout. Customer IDs are persisted via the webhook handler.
 */
export async function POST(req: Request) {
  if (!stripe) return new Response("Billing is not configured", { status: 501 });
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  const priceId = getPriceId(body.plan as PlanId, body.billing as BillingPeriod);
  if (!priceId) return new Response("Plan price not configured", { status: 501 });

  const sql = requireSql();
  const appUrl = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");

  // Lazy rate limit (per user, in-memory) — checkout endpoint shouldn't be
  // hammerable to spam Stripe customer creation.
  const last = lastAttempt.get(user.id) ?? 0;
  if (Date.now() - last < 5_000) {
    return rateLimited("Slow down — give that a moment.");
  }
  lastAttempt.set(user.id, Date.now());

  // Reuse or create the Stripe customer.
  const userRows = (await sql`
    SELECT stripe_customer_id FROM users WHERE id = ${user.id} LIMIT 1
  `) as Array<{ stripe_customer_id: string | null }>;
  let customerId = userRows[0]?.stripe_customer_id;
  if (!customerId) {
    const s = requireStripe();
    const customer = await s.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { clerk_user_id: user.clerk_user_id, app_user_id: user.id },
    });
    customerId = customer.id;
    await sql`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${user.id}`;
  }

  const s = requireStripe();
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { clerk_user_id: user.clerk_user_id, app_user_id: user.id, plan: body.plan },
    },
    // Customer enters card here even during trial → auto-charges on day 15.
    payment_method_collection: "always",
    allow_promotion_codes: true,
    success_url: `${appUrl}/dashboard?upgraded=1`,
    cancel_url: `${appUrl}/upgrade?canceled=1`,
    metadata: { clerk_user_id: user.clerk_user_id, app_user_id: user.id, plan: body.plan, billing: body.billing },
  });

  return json({ url: session.url });
}

// Process-local rate limit map. Per-instance, not distributed — fine for
// MVP because abuse just creates extra Stripe customers (harmless, cheap).
const lastAttempt = new Map<string, number>();
