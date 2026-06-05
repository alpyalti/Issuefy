import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { stripe, requireStripe } from "@/lib/stripe";
import { json } from "@/lib/api";

export const runtime = "nodejs";

/**
 * POST /api/billing/portal — open the Stripe Customer Portal for the current
 * user. Returns { url } for client redirect. Users without a stripe_customer_id
 * (haven't started checkout yet) get a 409 with a hint to upgrade first.
 */
export async function POST() {
  if (!stripe) return new Response("Billing is not configured", { status: 501 });
  const user = await requireUser();
  if (user instanceof Response) return user;
  const sql = requireSql();
  const rows = (await sql`
    SELECT stripe_customer_id FROM users WHERE id = ${user.id} LIMIT 1
  `) as Array<{ stripe_customer_id: string | null }>;
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) {
    return new Response("No subscription on file — start a plan first.", { status: 409 });
  }
  const appUrl = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");
  const s = requireStripe();
  const portal = await s.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/account`,
  });
  return json({ url: portal.url });
}
