import type Stripe from "stripe";
import { withTx } from "@/lib/db";
import { expectedBillingLivemode } from "@/lib/billing-mode";

export class AccountDeletionError extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}
export type DeletionRecord = {
  clerk_user_id: string; user_id: string | null; livemode: boolean;
  phase: "pending" | "billing_closed" | "identity_deleted" | "completed";
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
  trial_used: boolean; billing_unresolved: boolean;
  checkout_snapshot: {
    customer_id: string | null; customer_operation: string; customer_started_at: string;
    customer_params: Stripe.CustomerCreateParams;
    session_id: string | null; session_operation: string | null;
    session_started_at: string | null; session_params: Stripe.Checkout.SessionCreateParams | null;
    trial_used: boolean;
  } | null;
};
export interface DeletionStore {
  customer(id: string): Promise<void>;
  usedTrial(): Promise<void>;
  advance(from: DeletionRecord["phase"], to: DeletionRecord["phase"]): Promise<void>;
  finish(): Promise<void>;
  checkpoint(): Promise<void>;
}
export interface IdentityProvider {
  deleteUser(id: string): Promise<unknown>;
  getUser(id: string): Promise<unknown>;
}
const terminal = (status: string) => status === "canceled" || status === "incomplete_expired";
const reconcile = () => new AccountDeletionError("deletion_reconciliation_required", "Account deletion needs support to reconcile billing. Your account remains closed.");
const ownerId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id;
function mode(object: { livemode: boolean }, live: boolean) { if (object.livemode !== live) throw reconcile(); }
const requestOptions = { timeout: 10000, maxNetworkRetries: 1 };
function replayable(start: string | null, now: () => number) {
  return start !== null && now() - new Date(start).getTime() < 23 * 3600000;
}
function missingIdentity(error: unknown) {
  const e = error as { status?: number; errors?: Array<{ code?: string }> };
  return e?.status === 404 && e.errors?.some(x => x.code === "resource_not_found");
}

/** Match Clerk's instance mode as well as Stripe before any destructive work.
 * isolated_test is an operator assertion requiring separate DB/auth/providers.
 */
export function accountDeletionMode(): boolean {
  const live = expectedBillingLivemode();
  const prefix = live ? "sk_live_" : "sk_test_";
  if (!process.env.CLERK_SECRET_KEY?.startsWith(prefix)) {
    throw new AccountDeletionError("deletion_environment_invalid", "Account deletion configuration is invalid.");
  }
  return live;
}

/** Resumable desired-state operations. Never deletes a Stripe customer or
 * financial records. Immediate cancellation uses existing Stripe defaults:
 * no new invoice, proration or refund. Expire checkout before canceling all
 * mapped-customer subscriptions so an old payable URL cannot restart billing.
 */
export async function runAccountDeletion(record: DeletionRecord, store: DeletionStore, stripe: Stripe,
  identity: IdentityProvider, now = Date.now): Promise<void> {
  if (record.phase === "completed") return;
  if (record.phase === "pending") {
    if (record.billing_unresolved) throw reconcile();
    const snapshot = record.checkout_snapshot;
    let customerId = record.stripe_customer_id ?? snapshot?.customer_id ?? null;
    if (record.stripe_customer_id && snapshot?.customer_id && record.stripe_customer_id !== snapshot.customer_id) throw reconcile();
    if (!customerId && snapshot) {
      if (!replayable(snapshot.customer_started_at, now)) throw reconcile();
      await store.checkpoint();
      // Recover a customer request whose result never reached the checkout DB.
      const customer = await stripe.customers.create(snapshot.customer_params,
        { ...requestOptions, idempotencyKey: `ify:customer:${snapshot.customer_operation}` });
      mode(customer, record.livemode); customerId = customer.id;
    }
    if (!customerId && record.stripe_subscription_id) throw reconcile();
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId, {}, requestOptions);
      if (customer.deleted) throw reconcile();
      mode(customer, record.livemode);
      if (customer.metadata.app_user_id && customer.metadata.app_user_id !== record.user_id) throw reconcile();
      await store.customer(customerId);
      const sessions = new Map<string, Stripe.Checkout.Session>();
      for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 }, requestOptions)) {
        mode(session, record.livemode); sessions.set(session.id, session);
      }
      if (snapshot?.session_operation) {
        let session = snapshot.session_id ? await stripe.checkout.sessions.retrieve(snapshot.session_id, {}, requestOptions)
          : [...sessions.values()].find(x => x.metadata?.checkout_operation === snapshot.session_operation);
        if (!session) {
          if (!replayable(snapshot.session_started_at, now)) throw reconcile();
          await store.checkpoint();
          session = await stripe.checkout.sessions.create(snapshot.session_params!,
            { ...requestOptions, idempotencyKey: `ify:checkout:${snapshot.session_operation}` });
        }
        sessions.set(session.id, session);
      }
      const subscriptionIds = new Set<string>();
      if (record.stripe_subscription_id) subscriptionIds.add(record.stripe_subscription_id);
      for (let session of sessions.values()) {
        mode(session, record.livemode);
        if (ownerId(session.customer) !== customerId) throw reconcile();
        if (session.mode !== "subscription") continue;
        if (session.status === "open") {
          await store.checkpoint();
          try { session = await stripe.checkout.sessions.expire(session.id, {}, requestOptions); }
          catch {
            // Completion can win the expiration race. Retrieve current state;
            // anything still open or unknown keeps deletion pending.
            session = await stripe.checkout.sessions.retrieve(session.id, {}, requestOptions);
          }
          mode(session, record.livemode);
          if (ownerId(session.customer) !== customerId) throw reconcile();
        }
        if (session.status === "complete") {
          const subscriptionId = ownerId(session.subscription);
          if (!subscriptionId) throw reconcile();
          subscriptionIds.add(subscriptionId);
        } else if (session.status !== "expired") throw reconcile();
      }
      for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }, requestOptions)) {
        mode(sub, record.livemode);
        if (ownerId(sub.customer) !== customerId) throw reconcile();
        subscriptionIds.add(sub.id);
      }
      for (const id of subscriptionIds) {
        let sub = await stripe.subscriptions.retrieve(id, {}, requestOptions);
        mode(sub, record.livemode);
        if (ownerId(sub.customer) !== customerId) throw reconcile();
        if (sub.trial_start !== null || sub.trial_end !== null || sub.status === "trialing") await store.usedTrial();
        if (!terminal(sub.status)) {
          // Subscription schedules can create future subscriptions. This app
          // does not create schedules; do not silently choose a new schedule
          // cancellation policy for an externally managed customer.
          if (sub.schedule) throw reconcile();
          await store.checkpoint();
          sub = await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false }, requestOptions);
          mode(sub, record.livemode);
          if (ownerId(sub.customer) !== customerId || !terminal(sub.status)) throw reconcile();
        }
      }
      // Re-read after expiring checkout and canceling; no stale local status.
      for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }, requestOptions)) {
        mode(sub, record.livemode);
        if (ownerId(sub.customer) !== customerId || !terminal(sub.status)) throw reconcile();
      }
      for await (const schedule of stripe.subscriptionSchedules.list({ customer: customerId, limit: 100 }, requestOptions)) {
        mode(schedule, record.livemode);
        if (ownerId(schedule.customer) !== customerId || !["canceled", "completed", "released"].includes(schedule.status)) throw reconcile();
      }
    }
    await store.advance("pending", "billing_closed");
    record.phase = "billing_closed";
  }
  if (record.phase === "billing_closed") {
    await store.checkpoint();
    try { await identity.deleteUser(record.clerk_user_id); }
    catch (error) {
      if (!missingIdentity(error)) throw error;
      // Only a precise authenticated not-found response counts as completion.
      // A timeout/401/403/500 must never be interpreted as identity absence.
      try { await identity.getUser(record.clerk_user_id); throw reconcile(); }
      catch (verification) { if (!missingIdentity(verification)) throw verification; }
    }
    await store.advance("billing_closed", "identity_deleted");
    record.phase = "identity_deleted";
  }
  if (record.phase === "identity_deleted") await store.finish();
}

/** Authenticated DELETE passes its own Clerk ID. Trusted retry workers/operators
 * may resume an EXISTING tombstone with begin=false after Clerk session removal.
 * This helper is server-only and must not be exposed as an unauthenticated API.
 * Lock transactions never contain journal writes: provider outcomes survive
 * rollback. All durable phase transitions commit on separate connections.
 */
export async function deleteAccount(clerkId: string, stripe: Stripe, identity: IdentityProvider, begin = true) {
  const live = accountDeletionMode();
  return withTx(async lockClient => {
    const lock = await lockClient.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [`ify:delete:${clerkId}`]);
    if (!lock.rows[0].locked) throw new AccountDeletionError("deletion_busy", "Account deletion is already running. Retry in a moment.", 409);
    const checkpoint = async () => { await lockClient.query("SELECT 1"); };
    const initial = await withTx(async client => {
      const rows = await client.query("SELECT user_id FROM account_deletions WHERE clerk_user_id = $1 UNION SELECT id AS user_id FROM users WHERE clerk_user_id = $1 LIMIT 1", [clerkId]);
      return rows.rows[0]?.user_id as string | undefined;
    });
    if (initial) {
      const checkout = await lockClient.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [`ify:checkout:${live}:${initial}`]);
      if (!checkout.rows[0].locked) throw new AccountDeletionError("checkout_busy", "Checkout is still running. Retry account deletion in a moment.", 409);
    }
    const record = await withTx(async client => {
      await checkpoint();
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`ify:identity:${clerkId}`]);
      const existing = await client.query("SELECT * FROM account_deletions WHERE clerk_user_id = $1", [clerkId]);
      if (existing.rows[0]) return existing.rows[0] as DeletionRecord;
      if (!begin) throw new AccountDeletionError("deletion_not_requested", "No account deletion was requested.", 404);
      const accounts = await client.query("SELECT * FROM users WHERE clerk_user_id = $1 FOR UPDATE", [clerkId]);
      const user = accounts.rows[0];
      // If an identity was inserted after the initial lookup, retry to acquire
      // its checkout lock before taking any durable deletion action.
      if (user && user.id !== initial) throw new AccountDeletionError("deletion_busy", "Account changed. Retry deletion.", 409);
      const states = user ? await client.query("SELECT * FROM billing_checkout_state WHERE user_id = $1 AND livemode = $2 FOR UPDATE", [user.id, live]) : { rows: [] };
      const snapshot = states.rows[0] ?? null;
      const inserted = await client.query(`INSERT INTO account_deletions (clerk_user_id, user_id, livemode,
        stripe_customer_id, stripe_subscription_id, checkout_snapshot, trial_used, billing_unresolved)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
      [clerkId, user?.id ?? null, live, user?.stripe_customer_id ?? null, user?.stripe_subscription_id ?? null,
        snapshot ? JSON.stringify(snapshot) : null, snapshot?.trial_used ?? false,
        !!user?.subscription_status && !terminal(user.subscription_status) && !user.stripe_customer_id && !snapshot]);
      if (user) {
        const ambiguous = await client.query(`SELECT 1 FROM billing_notification_outbox WHERE sent_at IS NULL
          AND account_user_id IS NULL AND lower(recipient) = lower($1)
          AND (SELECT count(*) FROM users WHERE lower(email) = lower($1)) > 1 LIMIT 1`, [user.email]);
        if (ambiguous.rows.length) throw new AccountDeletionError("notification_reconciliation_required", "Account deletion needs support to reconcile pending notifications.");
        await client.query(`DELETE FROM billing_notification_outbox WHERE sent_at IS NULL
          AND (account_user_id = $1 OR (account_user_id IS NULL AND lower(recipient) = lower($2)))`, [user.id, user.email]);
        await client.query("UPDATE users SET subscription_status = 'deletion_pending', email_brief_enabled = false, role = 'user', updated_at = now() WHERE id = $1", [user.id]);
        await client.query("UPDATE projects SET is_active = false WHERE user_id = $1", [user.id]);
      }
      return inserted.rows[0] as DeletionRecord;
    });
    if (record.livemode !== live) throw reconcile();
    const update = async (statement: string, values: unknown[]) => {
      await checkpoint();
      return withTx(client => client.query(statement, values));
    };
    const store: DeletionStore = {
      checkpoint,
      async customer(id) {
        const result = await update(`UPDATE account_deletions SET stripe_customer_id = $2, updated_at = now()
          WHERE clerk_user_id = $1 AND phase = 'pending' AND (stripe_customer_id IS NULL OR stripe_customer_id = $2) RETURNING clerk_user_id`, [clerkId, id]);
        if (!result.rows.length) throw reconcile();
      },
      async usedTrial() { await update("UPDATE account_deletions SET trial_used = true, updated_at = now() WHERE clerk_user_id = $1", [clerkId]); },
      async advance(from, to) {
        const result = await update(`UPDATE account_deletions SET phase = $3, last_error_code = NULL, updated_at = now()
          WHERE clerk_user_id = $1 AND phase = $2 RETURNING clerk_user_id`, [clerkId, from, to]);
        if (!result.rows.length) throw reconcile();
      },
      async finish() {
        await checkpoint();
        await withTx(async client => {
          const row = await client.query("SELECT * FROM account_deletions WHERE clerk_user_id = $1 FOR UPDATE", [clerkId]);
          if (row.rows[0]?.phase === "completed") return;
          if (row.rows[0]?.phase !== "identity_deleted") throw reconcile();
          await client.query("DELETE FROM billing_notification_outbox WHERE account_user_id = $1 AND sent_at IS NULL", [record.user_id]);
          await client.query("DELETE FROM users WHERE id = $1 AND clerk_user_id = $2", [record.user_id, clerkId]);
          await client.query(`UPDATE account_deletions SET phase = 'completed', completed_at = now(), updated_at = now(),
            checkout_snapshot = NULL, last_error_code = NULL WHERE clerk_user_id = $1`, [clerkId]);
        });
      },
    };
    try { await runAccountDeletion(record, store, stripe, identity); }
    catch (error) {
      const code = error instanceof AccountDeletionError ? error.code : `deletion_${record.phase}_retry`;
      try { await update("UPDATE account_deletions SET last_error_code = $2, updated_at = now() WHERE clerk_user_id = $1 AND phase <> 'completed'", [clerkId, code]); } catch { /* existing durable phase still permits retry */ }
      if (error instanceof AccountDeletionError) throw error;
      throw new AccountDeletionError(code, "Account deletion is not complete. Retry or contact support; your account remains closed.");
    }
    return { ok: true, status: "completed" as const };
  });
}
