import { expectedBillingLivemode } from "@/lib/billing-mode";
import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { CheckoutError, createBillingCheckout } from "@/lib/billing-checkout";
import { stripe, requireStripe, getPriceId, type PlanId, type BillingPeriod } from "@/lib/stripe";
import { json, parseJson } from "@/lib/api";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["starter", "growth", "agency"]),
  billing: z.enum(["monthly", "annual"]),
}).strict();

/** Start or resume the user’s single durable subscription checkout. */
export async function POST(req: Request) {
  if (!stripe) return new Response("Billing is not configured", { status: 501 });
  try {
    expectedBillingLivemode();
  } catch {
    return json({ error: "Billing configuration is invalid.", code: "billing_mode_invalid" }, { status: 503 });
  }
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  const priceId = getPriceId(body.plan as PlanId, body.billing as BillingPeriod);
  if (!priceId) return new Response("Plan price not configured", { status: 501 });

  const appUrl = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");
  try {
    const url = await createBillingCheckout(requireStripe(), user, { ...body, priceId, appUrl });
    return json({ url });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    // Provider/database ambiguity is retryable with the same persisted operation.
    // Do not expose provider payloads, billing identities, or customer details.
    return json({ error: "Checkout is temporarily unavailable. Please retry.", code: "checkout_unavailable" }, { status: 503 });
  }
}
