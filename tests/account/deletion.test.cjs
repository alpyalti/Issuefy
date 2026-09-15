const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
function load(db = {}) {
  return loadTs('lib/account-deletion.ts', { '@/lib/db': db, '@/lib/billing-mode': loadTs('lib/billing-mode.ts') });
}
const { runAccountDeletion, AccountDeletionError } = load();
const absent = () => Object.assign(new Error('not found'), { status: 404, errors: [{ code: 'resource_not_found' }] });
function fixture() {
  const record = { clerk_user_id: 'clerk-synthetic', user_id: '10000000-0000-4000-8000-000000000001', livemode: false,
    phase: 'pending', stripe_customer_id: 'cus_synthetic', stripe_subscription_id: 'sub_synthetic',
    checkout_snapshot: null, trial_used: false, billing_unresolved: false };
  const sub = { id: 'sub_synthetic', customer: 'cus_synthetic', livemode: false, status: 'active', trial_start: null, trial_end: null, schedule: null };
  const subscriptions = new Map([[sub.id, sub]]);
  const sessions = new Map(); const schedules = [];
  const calls = []; const fail = {}; let identityExists = true; let finished = false;
  const clone = x => structuredClone(x);
  const store = {
    async customer(id) { calls.push('save-customer'); record.stripe_customer_id = id; },
    async usedTrial() { record.trial_used = true; },
    async advance(from, to) {
      calls.push(`phase:${to}`); if (fail[to]) { fail[to] = false; throw Error('DB unavailable'); }
      assert.equal(record.phase, from); record.phase = to;
    },
    async finish() { calls.push('finish'); if (fail.finish) { fail.finish = false; throw Error('DB unavailable'); } record.phase = 'completed'; finished = true; record.checkout_snapshot = null; },
    async checkpoint() { if (fail.checkpoint) throw Error('lock connection lost'); },
  };
  const stripe = {
    customers: {
      async create(params, options) { calls.push(['customer-create', params, options]); return { id: 'cus_synthetic', livemode: false, metadata: {} }; },
      async retrieve() { calls.push('customer-read'); if (fail.customer) throw Error('network'); return { id: 'cus_synthetic', livemode: fail.mode ? true : false, metadata: { app_user_id: record.user_id } }; },
    },
    checkout: { sessions: {
      async *list() { for (const s of sessions.values()) yield clone(s); },
      async retrieve(id) { if (!sessions.has(id)) throw Error('missing session'); return clone(sessions.get(id)); },
      async create(params, options) { calls.push(['session-create', params, options]); const s = { id: 'cs_recovered', customer: 'cus_synthetic', livemode: false, mode: 'subscription', status: 'open', metadata: params.metadata }; sessions.set(s.id, s); return clone(s); },
      async expire(id) {
        calls.push(`expire:${id}`); const s = sessions.get(id);
        if (fail.expireRace) { s.status = 'complete'; s.subscription = 'sub_synthetic'; fail.expireRace = false; throw Error('already complete'); }
        if (fail.expire) throw Error('network');
        s.status = 'expired'; return clone(s);
      },
    } },
    subscriptions: {
      async *list() { if (fail.list) throw Error('list unavailable'); for (const s of subscriptions.values()) yield clone(s); },
      async retrieve(id) { calls.push(`sub-read:${id}`); if (!subscriptions.has(id)) throw Error('missing subscription'); return clone(subscriptions.get(id)); },
      async cancel(id, params) { calls.push(['cancel', id, params]); if (fail.cancel) throw Error('network'); subscriptions.get(id).status = 'canceled';
        if (fail.cancelResponse) { fail.cancelResponse = false; throw Error('response lost'); } return clone(subscriptions.get(id)); },
    },
    subscriptionSchedules: { async *list() { for (const schedule of schedules) yield clone(schedule); } },
  };
  const identity = {
    async deleteUser(id) { calls.push(`clerk-delete:${id}`); if (fail.clerk) throw Error('Clerk unavailable'); if (!identityExists) throw absent(); identityExists = false;
      if (fail.clerkResponse) { fail.clerkResponse = false; throw Error('response lost'); } },
    async getUser() { calls.push('clerk-get'); if (fail.clerkGet) throw Object.assign(Error('forbidden'), { status: 403 }); if (!identityExists) throw absent(); return {}; },
  };
  return { record, sub, subscriptions, sessions, schedules, calls, fail, store, stripe, identity,
    run() { return runAccountDeletion(clone(record), store, stripe, identity); },
    get finished() { return finished; }, get identityExists() { return identityExists; },
  };
}
const code = (promise, value) => assert.rejects(promise, e => e.code === value);
test('immediate subscription cancellation precedes identity and local deletion', async () => {
  const f = fixture(); await f.run(); assert.equal(f.finished, true); assert.equal(f.identityExists, false);
  const cancel = f.calls.findIndex(x => Array.isArray(x) && x[0] === 'cancel');
  assert.deepEqual(f.calls[cancel][2], { invoice_now: false, prorate: false });
  assert.ok(cancel < f.calls.indexOf('clerk-delete:clerk-synthetic')); assert.ok(f.calls.indexOf('clerk-delete:clerk-synthetic') < f.calls.indexOf('finish'));
});
for (const failure of ['customer', 'list', 'cancel']) test(`Stripe ${failure} failure retains user/identity and retry completes`, async () => {
  const f = fixture(); f.fail[failure] = true; await assert.rejects(f.run());
  assert.equal(f.finished, false); assert.equal(f.identityExists, true); assert.equal(f.record.phase, 'pending');
  f.fail[failure] = false; await f.run(); assert.equal(f.finished, true);
});
test('lost cancellation response retries desired state without a second cancel', async () => {
  const f = fixture(); f.fail.cancelResponse = true; await assert.rejects(f.run()); await f.run();
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'cancel').length, 1);
});
test('Clerk failure never reports complete and does not lose Stripe mapping', async () => {
  const f = fixture(); f.fail.clerk = true; await assert.rejects(f.run());
  assert.equal(f.record.phase, 'billing_closed'); assert.equal(f.record.stripe_customer_id, 'cus_synthetic'); assert.equal(f.finished, false);
  f.fail.clerk = false; await f.run(); assert.equal(f.finished, true);
});
for (const failure of ['clerkResponse', 'identity_deleted']) test(`${failure}: trusted retry confirms Clerk absence and finishes`, async () => {
  const f = fixture(); f.fail[failure] = true; await assert.rejects(f.run());
  assert.equal(f.identityExists, false); assert.equal(f.finished, false); assert.equal(f.record.phase, 'billing_closed');
  await f.run(); assert.equal(f.finished, true); assert.ok(f.calls.includes('clerk-get'));
});
test('Clerk 403 after ambiguous deletion is not interpreted as successful absence', async () => {
  const f = fixture(); f.fail.clerkResponse = true; await assert.rejects(f.run()); f.fail.clerkGet = true;
  await assert.rejects(f.run(), /forbidden/); assert.equal(f.finished, false);
});
test('failed final database cleanup resumes without repeating external calls', async () => {
  const f = fixture(); f.fail.finish = true; await assert.rejects(f.run()); assert.equal(f.record.phase, 'identity_deleted');
  const count = f.calls.filter(x => String(x).startsWith('clerk-delete')).length;
  await f.run(); assert.equal(f.finished, true); assert.equal(f.calls.filter(x => String(x).startsWith('clerk-delete')).length, count);
});
test('completed retries have no external effects', async () => {
  const f = fixture(); await f.run(); const calls = f.calls.length; await f.run(); assert.equal(f.calls.length, calls);
});
test('all mapped-customer subscriptions canceled, including historical trial evidence', async () => {
  const f = fixture(); f.subscriptions.set('sub_second', { ...f.sub, id: 'sub_second', status: 'trialing', trial_start: 100, trial_end: 200 });
  await f.run(); assert.equal(f.record.trial_used, true);
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'cancel').length, 2);
});
test('open checkout expires before subscription cancellation', async () => {
  const f = fixture(); f.sessions.set('cs_open', { id: 'cs_open', customer: 'cus_synthetic', livemode: false, mode: 'subscription', status: 'open' });
  await f.run(); assert.ok(f.calls.indexOf('expire:cs_open') < f.calls.findIndex(x => Array.isArray(x) && x[0] === 'cancel'));
});
test('checkout completion winning expiration race is correlated and canceled', async () => {
  const f = fixture(); f.sessions.set('cs_open', { id: 'cs_open', customer: 'cus_synthetic', livemode: false, mode: 'subscription', status: 'open' });
  f.fail.expireRace = true; await f.run(); assert.equal(f.sub.status, 'canceled'); assert.equal(f.finished, true);
});
test('checkout expiration failure blocks identity deletion', async () => {
  const f = fixture(); f.sessions.set('cs_open', { id: 'cs_open', customer: 'cus_synthetic', livemode: false, mode: 'subscription', status: 'open' });
  f.fail.expire = true; await code(f.run(), 'deletion_reconciliation_required'); assert.equal(f.identityExists, true);
});
test('unknown customer operation recovered with original immutable key and params', async () => {
  const f = fixture(); f.record.stripe_customer_id = null; f.record.stripe_subscription_id = null;
  f.record.checkout_snapshot = { customer_id: null, customer_operation: 'old-operation', customer_started_at: new Date().toISOString(), customer_params: { metadata: { app_user_id: f.record.user_id } }, session_operation: null, trial_used: true };
  await f.run(); const call = f.calls.find(x => Array.isArray(x) && x[0] === 'customer-create');
  assert.equal(call[2].idempotencyKey, 'ify:customer:old-operation'); assert.equal(f.record.stripe_customer_id, 'cus_synthetic');
});
test('unknown old customer outcome fails closed instead of dropping billing identity', async () => {
  const f = fixture(); f.record.stripe_customer_id = null;
  f.record.checkout_snapshot = { customer_id: null, customer_operation: 'old', customer_started_at: '2000-01-01', customer_params: {} };
  await code(f.run(), 'deletion_reconciliation_required'); assert.equal(f.identityExists, true);
});
test('unknown session outcome recovered then expired, never returned to user', async () => {
  const f = fixture(); f.record.checkout_snapshot = { customer_id: 'cus_synthetic', session_operation: 'session-op', session_started_at: new Date().toISOString(), session_params: { metadata: { checkout_operation: 'session-op' } } };
  await f.run(); const call = f.calls.find(x => Array.isArray(x) && x[0] === 'session-create');
  assert.equal(call[2].idempotencyKey, 'ify:checkout:session-op'); assert.equal(f.sessions.get('cs_recovered').status, 'expired');
});
test('provider mode or subscription owner mismatch never cancels unrelated subscription', async () => {
  const f = fixture(); f.fail.mode = true; await code(f.run(), 'deletion_reconciliation_required');
  f.fail.mode = false; f.sub.customer = 'cus_other'; await code(f.run(), 'deletion_reconciliation_required');
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'cancel').length, 0);
});
test('missing billing mapping and nonterminal external schedule require reconciliation', async () => {
  const f = fixture(); f.record.billing_unresolved = true; await code(f.run(), 'deletion_reconciliation_required');
  f.record.billing_unresolved = false; f.schedules.push({ id: 'sched_future', livemode: false, customer: 'cus_synthetic', status: 'not_started' });
  await code(f.run(), 'deletion_reconciliation_required'); assert.equal(f.identityExists, true);
});
test('lock connection loss prevents provider mutations', async () => {
  const f = fixture(); f.fail.checkpoint = true; await assert.rejects(f.run());
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'cancel').length, 0); assert.equal(f.identityExists, true);
});

test('DELETE mode guard runs before auth and requireUser is never called', async () => {
  let authCalls = 0;
  const route = loadTs('app/api/account/route.ts', {
    zod: require('zod'), '@clerk/nextjs/server': { auth() { authCalls++; } },
    '@/lib/clerk-user': { requireUser() { throw Error('must not lazily upsert'); } }, '@/lib/db': {}, '@/lib/stripe': { stripe: {} },
    '@/lib/account-deletion': { accountDeletionMode() { throw Error('wrong mode'); } },
    '@/lib/api': { json: (body, init) => new Response(JSON.stringify(body), init) },
  });
  assert.equal((await route.DELETE()).status, 503); assert.equal(authCalls, 0);
});
test('DELETE returns failure/pending when resumable helper fails', async () => {
  const route = loadTs('app/api/account/route.ts', {
    zod: require('zod'), '@clerk/nextjs/server': { auth: async () => ({ userId: 'clerk-synthetic' }), clerkClient: async () => ({ users: {} }) },
    '@/lib/clerk-user': { requireUser() { throw Error('must not lazily upsert'); } }, '@/lib/db': {}, '@/lib/stripe': { stripe: {} },
    '@/lib/account-deletion': { AccountDeletionError, accountDeletionMode: () => false, deleteAccount: async () => { throw new AccountDeletionError('deletion_retry', 'Retry'); } },
    '@/lib/api': { json: (body, init) => new Response(JSON.stringify(body), init) },
  });
  const response = await route.DELETE(); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, status: 'pending', error: 'Retry', code: 'deletion_retry' });
});

for (const [name, data, stripeKey, clerkKey, host, allowed] of [
  ['default live', undefined, 'sk_live_synthetic', 'sk_live_synthetic', 'preview', true],
  ['explicit isolated test', 'isolated_test', 'sk_test_synthetic', 'sk_test_synthetic', 'preview', true],
  ['test keys on shared data', undefined, 'sk_test_synthetic', 'sk_test_synthetic', 'preview', false],
  ['test Clerk on live billing', undefined, 'sk_live_synthetic', 'sk_test_synthetic', 'production', false],
  ['live Clerk on test data', 'isolated_test', 'sk_test_synthetic', 'sk_live_synthetic', 'preview', false],
  ['missing Clerk key', undefined, 'sk_live_synthetic', undefined, 'production', false],
  ['isolated marker on production', 'isolated_test', 'sk_test_synthetic', 'sk_test_synthetic', 'production', false],
]) test(`deletion environment: ${name}`, () => {
  const names = ['BILLING_DATA_ENVIRONMENT', 'STRIPE_SECRET_KEY', 'CLERK_SECRET_KEY', 'VERCEL_ENV'];
  const before = names.map(n => process.env[n]);
  [data, stripeKey, clerkKey, host].forEach((v, i) => { if (v === undefined) delete process.env[names[i]]; else process.env[names[i]] = v; });
  try {
    if (allowed) assert.equal(load().accountDeletionMode(), data !== 'isolated_test');
    else assert.throws(() => load().accountDeletionMode());
  } finally { before.forEach((v, i) => { if (v === undefined) delete process.env[names[i]]; else process.env[names[i]] = v; }); }
});
