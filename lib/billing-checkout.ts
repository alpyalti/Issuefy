import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { expectedBillingLivemode } from "@/lib/billing-mode";
import { requireSql, withTx } from "@/lib/db";
import type { BillingPeriod, PlanId } from "@/lib/stripe";

export class CheckoutError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

type User = { id: string; email: string; name: string | null; clerk_user_id: string };
type Input = { plan: PlanId; billing: BillingPeriod; priceId: string; appUrl: string };
type State = {
  customer_id: string | null;
  customer_operation: string;
  customer_started_at: string;
  customer_params: Stripe.CustomerCreateParams;
  trial_used: boolean;
  session_operation: string | null;
  session_started_at: string | null;
  session_params: Stripe.Checkout.SessionCreateParams | null;
  session_id: string | null;
};
export interface CheckoutStore {
  load(user: User, live: boolean): Promise<State>;
  customer(id: string): Promise<void>;
  usedTrial(): Promise<void>;
  attempt(id: string, params: Stripe.Checkout.SessionCreateParams): Promise<void>;
  session(id: string): Promise<void>;
  checkpoint(): Promise<void>;
  legacy(): Promise<{ stripe_customer_id: string | null; stripe_subscription_id: string | null }>;
}

// Stop well before Stripe's minimum 24h idempotency retention. Unknown outcomes
// outside this window require reconciliation, never a fresh customer/session.
const REPLAY_MS = 23 * 60 * 60 * 1000;
const terminal = new Set(["canceled", "incomplete_expired"]);
const recovery = () => new CheckoutError("checkout_reconciliation_required", "Billing needs reconciliation. Please contact support.", 503);

function verifyMode(object: { livemode: boolean }, live: boolean) {
  if (object.livemode !== live) throw recovery();
}

/** Algorithm separated from transport/storage for deterministic failure tests. */
export async function runCheckout(s: Stripe, store: CheckoutStore, user: User, input: Input, live: boolean, now = Date.now): Promise<string> {
  const state = await store.load(user, live);
  const legacy = await store.legacy();
  let customerId = state.customer_id;
  // The mode guard allows test objects only in explicitly isolated test data.
  // Both environments keep the users mapping required by webhook/completion.
  if (!customerId && legacy.stripe_customer_id) {
    customerId = legacy.stripe_customer_id;
  }
  if (!customerId) {
    if (now() - new Date(state.customer_started_at).getTime() >= REPLAY_MS) throw recovery();
    await store.checkpoint();
    const customer = await s.customers.create(state.customer_params, {
      idempotencyKey: `ify:customer:${state.customer_operation}`,
    });
    verifyMode(customer, live);
    customerId = customer.id;
  }
  await store.checkpoint();
  const customer = await s.customers.retrieve(customerId);
  if (customer.deleted) throw recovery();
  verifyMode(customer, live);
  if (customer.metadata.app_user_id && customer.metadata.app_user_id !== user.id) throw recovery();
  if (legacy.stripe_customer_id && legacy.stripe_customer_id !== customerId) throw recovery();
  await store.customer(customerId);

  let usedTrial = state.trial_used;
  let subscribed = false;
  const inspect = (sub: Stripe.Subscription) => {
    verifyMode(sub, live);
    const owner = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    if (owner !== customerId) throw recovery();
    usedTrial ||= sub.trial_start !== null || sub.trial_end !== null || sub.status === "trialing";
    subscribed ||= !terminal.has(sub.status);
  };
  // Retrieve the persisted subscription as well as paginating the customer's
  // entire history. Do not trust stale webhook/local status or only page one.
  if (legacy.stripe_subscription_id) inspect(await s.subscriptions.retrieve(legacy.stripe_subscription_id));
  for await (const sub of s.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) inspect(sub);
  if (usedTrial && !state.trial_used) await store.usedTrial();
  if (subscribed) throw new CheckoutError("subscription_exists", "You already have a subscription. Manage it from billing settings.");

  // A legacy or externally created open checkout could still complete. Block
  // instead of minting a second payable URL. Existing journal sessions are
  // recovered below, including a response lost before its ID was persisted.
  let recovered: Stripe.Checkout.Session | undefined;
  for await (const session of s.checkout.sessions.list({ customer: customerId, limit: 100 })) {
    verifyMode(session, live);
    if (state.session_operation && session.metadata?.checkout_operation === state.session_operation) {
      if (recovered && recovered.id !== session.id) throw recovery();
      recovered = session;
    } else if (session.mode === "subscription" && session.status === "open") {
      throw new CheckoutError("checkout_already_open", "A checkout is already open. Complete it or wait for it to expire.");
    } else if (session.mode === "subscription" && session.status === "complete") {
      // Cover completion between the subscription-history read and this list,
      // including legacy checkouts for which we have no operation journal.
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!id) throw recovery();
      inspect(await s.subscriptions.retrieve(id));
    }
  }
  if (usedTrial && !state.trial_used) await store.usedTrial();
  if (subscribed) throw new CheckoutError("subscription_exists", "You already have a subscription. Manage it from billing settings.");

  if (state.session_operation) {
    let session = state.session_id ? await s.checkout.sessions.retrieve(state.session_id) : recovered;
    if (!session) {
      if (now() - new Date(state.session_started_at!).getTime() >= REPLAY_MS) throw recovery();
      await store.checkpoint();
      // Persisted params are immutable across plan/price/email/app URL changes.
      // Fixed expiry also prevents a delayed worker creating a payable stale
      // session after this attempt has been confirmed expired and replaced.
      session = await s.checkout.sessions.create(state.session_params!, {
        idempotencyKey: `ify:checkout:${state.session_operation}`,
      });
    }
    verifyMode(session, live);
    if (session.customer !== customerId || session.mode !== "subscription") throw recovery();
    await store.session(session.id);
    if (session.status === "complete") {
      // A completed session is reusable only as history after its actual
      // subscription has terminated. Missing correlation fails closed.
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) throw recovery();
      inspect(await s.subscriptions.retrieve(subscriptionId));
      if (usedTrial && !state.trial_used) await store.usedTrial();
      if (subscribed) throw new CheckoutError("subscription_exists", "You already have a subscription. Manage it from billing settings.");
    }
    if (session.status === "open") {
      if (state.session_params?.metadata?.plan !== input.plan || state.session_params?.metadata?.billing !== input.billing) {
        throw new CheckoutError("checkout_plan_conflict", "A checkout for another plan is already open. Complete it or wait for it to expire.");
      }
      if (!session.url) throw recovery();
      return session.url;
    }
    if (session.status !== "expired" && session.status !== "complete") throw recovery();
  }

  const operation = randomUUID();
  const identity = { clerk_user_id: user.clerk_user_id, app_user_id: user.id };
  const metadata = { ...identity, plan: input.plan, billing: input.billing, checkout_operation: operation };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription", customer: customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    subscription_data: {
      ...(input.plan === "starter" && !usedTrial ? { trial_period_days: 14 } : {}),
      metadata,
    },
    payment_method_collection: "always", allow_promotion_codes: true,
    expires_at: Math.floor(now() / 1000) + 3600,
    success_url: `${input.appUrl}/billing/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.appUrl}/upgrade?canceled=1&plan=${input.plan}&billing=${input.billing}`,
    metadata,
  };
  await store.attempt(operation, params);
  await store.checkpoint();
  const session = await s.checkout.sessions.create(params, { idempotencyKey: `ify:checkout:${operation}` });
  verifyMode(session, live);
  await store.session(session.id);
  if (!session.url || session.status !== "open") throw recovery();
  return session.url;
}

/**
 * Transaction advisory lock works with Neon's transaction pooler. The journal
 * uses separate autocommitted HTTP statements: rolling back the lock transaction
 * must NEVER roll back a Stripe operation's previously recorded key/params.
 * No expiring lease: a slow healthy worker retains ownership. Connection loss
 * releases the lock; immutable operations handle the in-flight remote request.
 */
export async function createBillingCheckout(s: Stripe, user: User, input: Input): Promise<string> {
  const live = expectedBillingLivemode();
  const sql = requireSql();
  return withTx(async (client) => {
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [`ify:checkout:${live}:${user.id}`]);
    if (!lock.rows[0].locked) throw new CheckoutError("checkout_busy", "Checkout is being prepared. Please retry in a moment.");
    const checkpoint = async () => { await client.query("SELECT 1"); };
    const query = async (statement: string, values: unknown[] = []) => {
      await checkpoint();
      return sql.query(statement, values);
    };
    let expectedOperation: string | null = null;
    const store: CheckoutStore = {
      checkpoint,
      async load() {
        const params = { email: user.email, ...(user.name ? { name: user.name } : {}), metadata: { clerk_user_id: user.clerk_user_id, app_user_id: user.id } };
        await query(`INSERT INTO billing_checkout_state (user_id, livemode, customer_operation, customer_params)
          VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (user_id, livemode) DO NOTHING`, [user.id, live, randomUUID(), JSON.stringify(params)]);
        const rows = await query("SELECT * FROM billing_checkout_state WHERE user_id = $1 AND livemode = $2", [user.id, live]);
        expectedOperation = (rows[0] as State).session_operation;
        return rows[0] as State;
      },
      async legacy() {
        const rows = await query("SELECT stripe_customer_id, stripe_subscription_id FROM users WHERE id = $1", [user.id]);
        if (!rows[0]) throw recovery();
        return rows[0] as { stripe_customer_id: string | null; stripe_subscription_id: string | null };
      },
      async customer(id) {
        const saved = await query(`UPDATE billing_checkout_state SET customer_id = $3, updated_at = now()
          WHERE user_id = $1 AND livemode = $2 AND (customer_id IS NULL OR customer_id = $3) RETURNING user_id`, [user.id, live, id]);
        if (!saved.length) throw recovery();
        const rows = await query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1
          AND (stripe_customer_id IS NULL OR stripe_customer_id = $2) RETURNING id`, [user.id, id]);
        if (!rows.length) throw recovery();
      },
      async usedTrial() { await query("UPDATE billing_checkout_state SET trial_used = true, updated_at = now() WHERE user_id = $1 AND livemode = $2", [user.id, live]); },
      async attempt(id, params) {
        // CAS fences a disconnected old worker even if its HTTP write was
        // delayed after a successful connection checkpoint. Only one successor
        // may replace the exact attempt this worker actually inspected.
        const saved = await query(`UPDATE billing_checkout_state SET session_operation = $3, session_params = $4::jsonb,
          session_started_at = now(), session_id = NULL, updated_at = now() WHERE user_id = $1 AND livemode = $2
          AND session_operation IS NOT DISTINCT FROM $5::uuid RETURNING user_id`, [user.id, live, id, JSON.stringify(params), expectedOperation]);
        if (!saved.length) throw recovery();
        expectedOperation = id;
      },
      async session(id) {
        const saved = await query(`UPDATE billing_checkout_state SET session_id = $3, updated_at = now()
          WHERE user_id = $1 AND livemode = $2 AND session_operation = $4::uuid RETURNING user_id`, [user.id, live, id, expectedOperation]);
        if (!saved.length) throw recovery();
      },
    };
    return runCheckout(s, store, user, input, live);
  });
}
