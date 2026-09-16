import type Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { withTx } from "@/lib/db";
import { expectedBillingLivemode } from "@/lib/billing-mode";
import { captureError } from "@/lib/sentry";
import { processBillingEvent, deliverBillingNotifications } from "@/lib/billing/webhook";
import { sendBillingNotification } from "@/lib/billing/notifications";

export const runtime = "nodejs";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!stripe || !SECRET) return new Response("Stripe webhook not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, SECRET);
  } catch (err) {
    captureError(err, { stage: "stripe.signature" });
    return new Response("Invalid signature", { status: 400 });
  }
  let expectedMode: boolean;
  try {
    expectedMode = expectedBillingLivemode();
  } catch {
    return new Response("Stripe webhook billing environment mismatch", { status: 503 });
  }
  if (event.livemode !== expectedMode) {
    return new Response("Stripe event mode mismatch", { status: 400 });
  }
  try {
    const result = await processBillingEvent(event, {
      transaction: withTx,
      retrieveSubscription: (id) => stripe!.subscriptions.retrieve(id, { expand: [] }, { timeout: 10000, maxNetworkRetries: 1 }),
      planFromPriceId,
    });
    // Returning 500 on a send failure asks Stripe to retry the outbox only;
    // the billing transaction remains complete and is never applied twice.
    await deliverBillingNotifications(event.id, withTx, sendBillingNotification);
    return new Response(result === "duplicate" ? "Duplicate" : "OK");
  } catch (err) {
    captureError(err, { stage: "stripe.handler", type: event.type });
    return new Response("Handler error", { status: 500 });
  }
}
