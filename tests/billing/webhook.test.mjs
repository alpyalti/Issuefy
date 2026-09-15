import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

// Compile only the dependency-injected billing module; no credentials or providers.
const source = await fs.readFile(new URL('../../lib/billing/webhook.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { processBillingEvent, deliverBillingNotifications } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture() {
  let state = { receipts: {}, outbox: [], deletions: [], account: { id: 'user_1', email: 'test@example.invalid', plan: 'starter', stripe_subscription_id: 'sub_1', subscription_status: 'active' }, writes: 0 };
  let queue = Promise.resolve();
  let fail = null;
  const subscriptions = { sub_1: { id: 'sub_1', customer: 'cus_1', status: 'active', created: 100, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_starter' }, current_period_end: 300 }] } } };
  const queries = [];
  // Transaction double serializes access and restores all writes on rollback.
  // PostgreSQL lock/unique semantics still require disposable integration QA.
  async function transaction(fn) {
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    const before = structuredClone(state);
    try {
      return await fn({ query: async (sql, values) => {
        queries.push(sql);
        if (fail && sql.includes(fail)) { fail = null; throw new Error('Injected database failure'); }
        if (sql.startsWith('INSERT INTO stripe_webhook_events')) state.receipts[values[0]] ??= { completed_at: null };
        else if (sql.startsWith('SELECT completed_at')) return { rows: [state.receipts[values[0]]] };
        else if (sql.startsWith('SELECT id, email')) return { rows: state.account ? [structuredClone(state.account)] : [] };
        else if (sql.startsWith('SELECT livemode FROM account_deletions')) return { rows: state.deletions.filter(d => d.stripe_customer_id === values[0] || (values[1] && d.user_id === values[1])) };
        else if (sql.startsWith('UPDATE users')) {
          const [sub, status, period, cancel, plan] = values;
          Object.assign(state.account, { stripe_subscription_id: sub, subscription_status: status, current_period_end: period, cancel_at_period_end: cancel, plan: plan ?? state.account.plan });
          state.writes++;
        } else if (sql.startsWith('INSERT INTO billing_notification')) {
          const [event_id, kind, recipient, plan, account_user_id] = values;
          if (!state.outbox.some(n => n.event_id === event_id && n.kind === kind)) state.outbox.push({ event_id, kind, recipient, plan, account_user_id, sent_at: null });
        } else if (sql.startsWith('UPDATE stripe_webhook_events')) state.receipts[values[0]].completed_at = 'committed';
        else if (sql.startsWith('SELECT event_id')) return { rows: state.outbox.filter(n => n.event_id === values[0] && !n.sent_at) };
        else if (sql.startsWith('UPDATE billing_notification')) state.outbox.find(n => n.event_id === values[0] && n.kind === values[1]).sent_at = 'sent';
        else throw new Error(`Unmocked SQL: ${sql}`);
        return { rows: [] };
      } });
    } catch (error) { state = before; throw error; }
    finally { release(); }
  }
  const deps = { transaction, retrieveSubscription: async id => { assert.ok(subscriptions[id]); return structuredClone(subscriptions[id]); }, planFromPriceId: id => ({ price_starter: 'starter', price_growth: 'growth' }[id] ?? null) };
  const event = (eventId = 'evt_1', type = 'customer.subscription.updated', object = { id: 'sub_1', customer: 'cus_1' }) => ({ id: eventId, type, livemode: false, created: 50, data: { object } });
  return { deps, event, subscriptions, queries, get state() { return state; }, fail: sql => { fail = sql; } };
}

test('concurrent duplicate success commits billing once and emits no false plan email', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => processBillingEvent(f.event(), f.deps)));
  assert.equal(results.filter(x => x === 'processed').length, 1);
  assert.equal(f.state.writes, 1);
  assert.deepEqual(f.state.outbox, []);
  assert.ok(f.queries.some(q => q.includes('users WHERE stripe_customer_id = $1 FOR UPDATE')));
});

for (const stage of ['UPDATE users', 'INSERT INTO billing_notification', 'UPDATE stripe_webhook_events']) {
  test(`failure at ${stage} rolls back receipt and effects; retry succeeds`, async () => {
    const f = fixture(); f.subscriptions.sub_1.items.data[0].price.id = 'price_growth'; f.fail(stage);
    await assert.rejects(processBillingEvent(f.event(), f.deps), /Injected/);
    assert.deepEqual(f.state.receipts, {}); assert.equal(f.state.writes, 0); assert.deepEqual(f.state.outbox, []);
    await processBillingEvent(f.event(), f.deps);
    assert.equal(f.state.account.plan, 'growth'); assert.equal(f.state.outbox.length, 1);
  });
}

test('unrelated subscription deletion and invoice cannot overwrite active subscription', async () => {
  const f = fixture(); f.subscriptions.sub_old = { ...f.subscriptions.sub_1, id: 'sub_old', created: 10, status: 'canceled' };
  await processBillingEvent(f.event('evt_old', 'customer.subscription.deleted', { id: 'sub_old', customer: 'cus_1' }), f.deps);
  await processBillingEvent(f.event('evt_inv', 'invoice.payment_failed', { customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_old' } } }), f.deps);
  assert.equal(f.state.writes, 0); assert.equal(f.state.account.subscription_status, 'active'); assert.deepEqual(f.state.outbox, []);
});

test('reordered update payload uses current Stripe state and sends real plan change once', async () => {
  const f = fixture(); f.subscriptions.sub_1.items.data[0].price.id = 'price_growth';
  await processBillingEvent(f.event('evt_new'), f.deps);
  await processBillingEvent(f.event('evt_old', 'customer.subscription.updated', { ...f.subscriptions.sub_1, status: 'past_due', items: { data: [{ price: { id: 'price_starter' } }] } }), f.deps);
  assert.equal(f.state.account.plan, 'growth'); assert.equal(f.state.account.subscription_status, 'active');
  assert.deepEqual(f.state.outbox.map(n => n.kind), ['plan_changed']);
});

test('paid invoice retains actual trialing status and one-off invoice is ignored', async () => {
  const f = fixture(); f.subscriptions.sub_1.status = 'trialing';
  await processBillingEvent(f.event('evt_paid', 'invoice.payment_succeeded', { customer: 'cus_1', subscription: 'sub_1' }), f.deps);
  await processBillingEvent(f.event('evt_oneoff', 'invoice.payment_failed', { customer: 'cus_1' }), f.deps);
  assert.equal(f.state.account.subscription_status, 'trialing'); assert.equal(f.state.writes, 1); assert.deepEqual(f.state.outbox, []);
});

test('checkout ignores metadata plan and older checkout cannot replace newer subscription', async () => {
  const f = fixture(); f.subscriptions.sub_old = { ...f.subscriptions.sub_1, id: 'sub_old', created: 10 };
  await processBillingEvent(f.event('evt_checkout', 'checkout.session.completed', { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'agency' } }), f.deps);
  await processBillingEvent(f.event('evt_oldcheckout', 'checkout.session.completed', { mode: 'subscription', customer: 'cus_1', subscription: 'sub_old' }), f.deps);
  assert.equal(f.state.account.plan, 'starter'); assert.equal(f.state.account.stripe_subscription_id, 'sub_1');
});

test('new subscription replaces terminal predecessor, overlapping live one does not', async () => {
  const f = fixture(); f.subscriptions.sub_2 = { ...f.subscriptions.sub_1, id: 'sub_2', created: 200 };
  await processBillingEvent(f.event('evt_overlap', 'customer.subscription.created', { id: 'sub_2', customer: 'cus_1' }), f.deps);
  assert.equal(f.state.account.stripe_subscription_id, 'sub_1');
  f.subscriptions.sub_1.status = 'canceled';
  await processBillingEvent(f.event('evt_replace', 'customer.subscription.updated', { id: 'sub_2', customer: 'cus_1' }), f.deps);
  assert.equal(f.state.account.stripe_subscription_id, 'sub_2');
});

test('legacy receipt with no completion marker can recover', async () => {
  const f = fixture(); f.state.receipts.evt_1 = { completed_at: null };
  assert.equal(await processBillingEvent(f.event(), f.deps), 'processed'); assert.equal(f.state.writes, 1);
});

test('missing account or Stripe read failure never consumes event', async () => {
  const f = fixture(); f.deps.retrieveSubscription = async () => { throw new Error('Stripe unavailable'); };
  await assert.rejects(processBillingEvent(f.event(), f.deps), /Stripe unavailable/); assert.deepEqual(f.state.receipts, {});
  f.state.account = null;
  await assert.rejects(processBillingEvent(f.event(), f.deps), /mapping unavailable/); assert.deepEqual(f.state.receipts, {});
});

test('outbox failure leaves billing complete; duplicate retries delivery without reapplying', async () => {
  const f = fixture(); f.subscriptions.sub_1.status = 'past_due';
  await processBillingEvent(f.event(), f.deps);
  await assert.rejects(deliverBillingNotifications('evt_1', f.deps.transaction, async () => { throw new Error('Email unavailable'); }));
  assert.equal(f.state.writes, 1); assert.equal(f.state.outbox[0].sent_at, null);
  assert.equal(await processBillingEvent(f.event(), f.deps), 'duplicate');
  let sends = 0;
  await Promise.all(Array.from({ length: 3 }, () => deliverBillingNotifications('evt_1', f.deps.transaction, async () => { sends++; })));
  assert.equal(sends, 1); assert.equal(f.state.writes, 1);
});

test('late created event cannot reactivate canceled subscription or repeat cancellation email', async () => {
  const f = fixture(); f.subscriptions.sub_1.status = 'canceled';
  await processBillingEvent(f.event('evt_delete', 'customer.subscription.deleted'), f.deps);
  await processBillingEvent(f.event('evt_create', 'customer.subscription.created', { ...f.subscriptions.sub_1, status: 'active' }), f.deps);
  assert.equal(f.state.account.subscription_status, 'canceled');
  assert.deepEqual(f.state.outbox.map(n => n.kind), ['canceled']);
});

test('initial attachment does not send a plan-change notification', async () => {
  const f = fixture(); f.state.account.stripe_subscription_id = null;
  f.subscriptions.sub_1.items.data[0].price.id = 'price_growth';
  await processBillingEvent(f.event(), f.deps);
  assert.equal(f.state.account.plan, 'growth'); assert.deepEqual(f.state.outbox, []);
});

test('provider subscription customer mismatch rolls back receipt', async () => {
  const f = fixture(); f.subscriptions.sub_1.customer = 'cus_other';
  await assert.rejects(processBillingEvent(f.event(), f.deps), /correlation failed/);
  assert.deepEqual(f.state.receipts, {}); assert.equal(f.state.writes, 0);
});

for (const phase of ['pending', 'billing_closed', 'identity_deleted', 'completed']) {
  test(`known ${phase} deletion acknowledges event without provider, entitlement, or outbox effects`, async () => {
    const f = fixture();
    f.state.deletions.push({ user_id: 'user_1', stripe_customer_id: 'cus_1', livemode: false, phase });
    if (phase === 'completed') f.state.account = null;
    f.deps.retrieveSubscription = async () => { throw new Error('Must not call Stripe for deleted account'); };
    assert.equal(await processBillingEvent(f.event(), f.deps), 'processed');
    assert.equal(await processBillingEvent(f.event(), f.deps), 'duplicate');
    assert.equal(f.state.writes, 0); assert.deepEqual(f.state.outbox, []);
    assert.equal(f.state.receipts.evt_1.completed_at, 'committed');
  });
}
test('missing account with unrelated or wrong-mode deletion marker remains retryable', async () => {
  const f = fixture(); f.state.account = null;
  f.state.deletions.push({ stripe_customer_id: 'cus_other', livemode: false });
  await assert.rejects(processBillingEvent(f.event(), f.deps), /mapping unavailable/);
  f.state.deletions.push({ stripe_customer_id: 'cus_1', livemode: true });
  await assert.rejects(processBillingEvent(f.event(), f.deps), /mode mismatch/);
  assert.deepEqual(f.state.receipts, {});
});
test('receipt completion failure for deleted account rolls back and retries', async () => {
  const f = fixture(); f.state.account = null;
  f.state.deletions.push({ stripe_customer_id: 'cus_1', livemode: false });
  f.fail('UPDATE stripe_webhook_events');
  await assert.rejects(processBillingEvent(f.event(), f.deps), /Injected/);
  assert.deepEqual(f.state.receipts, {});
  assert.equal(await processBillingEvent(f.event(), f.deps), 'processed');
});

test('new plan notification uses locked account ID, independent of recipient email', async () => {
  const f = fixture(); f.subscriptions.sub_1.items.data[0].price.id = 'price_growth';
  await processBillingEvent(f.event(), f.deps);
  assert.equal(f.state.outbox[0].account_user_id, 'user_1');
});
