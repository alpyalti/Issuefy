import type Stripe from "stripe";
import type { PoolClient } from "@neondatabase/serverless";

type Client = Pick<PoolClient, "query">;
type Transaction = <T>(fn: (client: Client) => Promise<T>) => Promise<T>;
type Account = { id: string; email: string; plan: string; stripe_subscription_id: string | null; subscription_status: string | null };
export type Notification = { event_id: string; kind: "plan_changed" | "canceled" | "payment_failed"; recipient: string; plan: string };
type Dependencies = {
  transaction: Transaction;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  planFromPriceId: (id: string) => string | null;
};
const terminal = (status: string) => status === "canceled" || status === "incomplete_expired";
function id(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

function target(event: Stripe.Event): { customer: string; subscription: string } | null {
  const object = event.data.object;
  let subscription: string | null = null;
  let customer: string | null = null;
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = object as Stripe.Subscription;
      customer = id(sub.customer); subscription = sub.id; break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = object as Stripe.Invoice & { subscription?: unknown };
      customer = id(invoice.customer);
      subscription = id(invoice.parent?.subscription_details?.subscription) ?? id(invoice.subscription);
      break;
    }
    case "checkout.session.completed": {
      const session = object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return null;
      customer = id(session.customer); subscription = id(session.subscription); break;
    }
  }
  return customer && subscription ? { customer, subscription } : null;
}

/** The unique event row and user lock are held until all database effects commit.
 * Retrieve AFTER the account lock: concurrent requests cannot write an older
 * pre-lock snapshot, and event timestamps (only second precision) aren't needed.
 */
export async function processBillingEvent(event: Stripe.Event, deps: Dependencies) {
  return deps.transaction(async (client) => {
    await client.query("INSERT INTO stripe_webhook_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [event.id, event.type]);
    const receipt = await client.query("SELECT completed_at FROM stripe_webhook_events WHERE id = $1 FOR UPDATE", [event.id]);
    if (receipt.rows[0].completed_at) return "duplicate";
    const ref = target(event);
    if (ref) {
      const accounts = await client.query("SELECT id, email, plan, stripe_subscription_id, subscription_status FROM users WHERE stripe_customer_id = $1 FOR UPDATE", [ref.customer]);
      const account = accounts.rows[0] as Account | undefined;
      // Migration 0020 retains deletion markers after the users row is gone.
      // Read AFTER locking the account: deletion initialization also locks it,
      // so a committed pending marker is visible before any reconciliation.
      // Do not lock the marker here: deletion finish locks marker -> users.
      const deletions = await client.query(`SELECT livemode FROM account_deletions
        WHERE stripe_customer_id = $1 OR user_id = $2`, [ref.customer, account?.id ?? null]);
      if (deletions.rows.length) {
        if (deletions.rows.some(row => row.livemode !== event.livemode)) {
          throw new Error("Account deletion billing mode mismatch");
        }
        // Pending and completed deletion both prohibit billing/mail changes.
        // Commit only the receipt, keeping retry/duplicate semantics intact.
        await client.query("UPDATE stripe_webhook_events SET completed_at = now() WHERE id = $1", [event.id]);
        return "processed";
      }
      // Checkout customer mapping may still be committing. Do not acknowledge a lost update.
      if (!account) throw new Error("Billing account mapping unavailable");
      const sub = await deps.retrieveSubscription(ref.subscription);
      if (id(sub.customer) !== ref.customer || sub.id !== ref.subscription) throw new Error("Subscription correlation failed");
      let relevant = true;
      if (account.stripe_subscription_id && account.stripe_subscription_id !== sub.id) {
        const current = await deps.retrieveSubscription(account.stripe_subscription_id);
        if (id(current.customer) !== ref.customer) throw new Error("Current subscription correlation failed");
        // A second overlapping subscription never takes over a live subscription.
        // Only a newer replacement after termination can become the current one.
        relevant = terminal(current.status) && sub.created > current.created && !terminal(sub.status);
      }
      if (relevant) {
        const item = sub.items.data[0];
        const plan = item ? deps.planFromPriceId(item.price.id) : null;
        const period = item?.current_period_end ?? (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
        const changed = !!account.stripe_subscription_id && !!plan && plan !== account.plan;
        await client.query(`UPDATE users SET stripe_subscription_id = $1, subscription_status = $2,
          current_period_end = $3, cancel_at_period_end = $4, plan = COALESCE($5, plan),
          plan_started_at = CASE WHEN $6 THEN now() ELSE COALESCE(plan_started_at, now()) END,
          updated_at = now() WHERE id = $7`,
        [sub.id, sub.status, period ? new Date(period * 1000).toISOString() : null, sub.cancel_at_period_end, plan, changed, account.id]);
        const kinds: Notification["kind"][] = [];
        if (changed && ["active", "trialing"].includes(sub.status)) kinds.push("plan_changed");
        if (sub.status === "canceled" && account.subscription_status !== "canceled") kinds.push("canceled");
        if (sub.status === "past_due" && account.subscription_status !== "past_due") kinds.push("payment_failed");
        for (const kind of kinds) {
          await client.query(`INSERT INTO billing_notification_outbox (event_id, kind, recipient, plan, account_user_id)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [event.id, kind, account.email, plan ?? account.plan, account.id]);
        }
      }
    }
    await client.query("UPDATE stripe_webhook_events SET completed_at = now() WHERE id = $1", [event.id]);
    return "processed";
  });
}

/** Separate transaction: mail failures cannot roll back committed entitlements.
 * A duplicate webhook drains the same durable rows, including after a crash.
 */
export async function deliverBillingNotifications(eventId: string, transaction: Transaction, send: (notification: Notification) => Promise<void>) {
  await transaction(async (client) => {
    const pending = await client.query("SELECT event_id, kind, recipient, plan FROM billing_notification_outbox WHERE event_id = $1 AND sent_at IS NULL ORDER BY kind FOR UPDATE", [eventId]);
    for (const notification of pending.rows as Notification[]) {
      await send(notification);
      await client.query("UPDATE billing_notification_outbox SET sent_at = now() WHERE event_id = $1 AND kind = $2", [notification.event_id, notification.kind]);
    }
  });
}
