const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Script } = require('node:vm');
const ts = require('typescript');

// Self-contained loader: no SDK, authentication, database, or network imports.
function loadFile(path, mocks = {}) {
  const filename = resolve(__dirname, '../..', path);
  const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const module = { exports: {} };
  new Script(`(function(require,module,exports){${js}\n})`, { filename }).runInThisContext()(
    id => {
      if (id === 'node:crypto') return require(id);
      if (Object.hasOwn(mocks, id)) return mocks[id];
      throw new Error(`Unexpected import: ${id}`);
    }, module, module.exports);
  return module.exports;
}
function load(db = {}) {
  return loadFile('lib/billing-checkout.ts', {
    '@/lib/db': db, '@/lib/billing-mode': loadFile('lib/billing-mode.ts'),
  });
}
const api = load();
const user = { id: 'user-1', clerk_user_id: 'clerk-1', email: 'a@example.test', name: 'A' };
const input = { plan: 'starter', billing: 'monthly', priceId: 'price_1', appUrl: 'https://example.test' };

function fixture(live = false) {
  let time = Date.parse('2026-09-15T00:00:00Z');
  const state = { customer_id: null, customer_operation: 'customer-op', customer_started_at: new Date(time).toISOString(),
    customer_params: { email: user.email, metadata: { app_user_id: user.id } }, trial_used: false,
    session_operation: null, session_started_at: null, session_params: null, session_id: null };
  const legacy = { stripe_customer_id: null, stripe_subscription_id: null };
  const calls = { customers: [], sessions: [], customerReads: [], subscriptionReads: [] };
  const customers = new Map(); const sessions = new Map(); const subscriptions = [];
  const customerKeys = new Map(); const sessionKeys = new Map();
  const faults = {};
  const clone = v => structuredClone(v);
  const store = {
    async load() { return clone(state); }, async legacy() { return clone(legacy); }, async checkpoint() { if (faults.disconnected) throw Error('connection lost'); },
    async customer(id) { if (faults.customerWrite) { faults.customerWrite = false; throw Error('DB write lost'); } state.customer_id = id; },
    async usedTrial() { state.trial_used = true; },
    async attempt(id, params) { state.session_operation = id; state.session_started_at = new Date(time).toISOString(); state.session_params = clone(params); state.session_id = null; },
    async session(id) { if (faults.sessionWrite) { faults.sessionWrite = false; throw Error('DB write lost'); } state.session_id = id; },
  };
  const stripe = {
    customers: {
      async create(params, options) {
        calls.customers.push({ params: clone(params), ...options });
        let c = customerKeys.get(options.idempotencyKey);
        if (!c) { c = { id: `cus_${customers.size + 1}`, livemode: live, metadata: clone(params.metadata) }; customerKeys.set(options.idempotencyKey, c); customers.set(c.id, c); }
        if (faults.customerResponse) { faults.customerResponse = false; throw Error('response lost'); }
        return clone(c);
      },
      async retrieve(id) { calls.customerReads.push(id); if (!customers.has(id)) throw Error('missing customer'); return clone(customers.get(id)); },
    },
    subscriptions: {
      async retrieve(id) { calls.subscriptionReads.push(id); const sub = subscriptions.find(x => x.id === id); if (!sub) throw Error('missing subscription'); return clone(sub); },
      async *list() { for (const s of subscriptions) yield clone(s); },
    },
    checkout: { sessions: {
      async create(params, options) {
        calls.sessions.push({ params: clone(params), ...options });
        let s = sessionKeys.get(options.idempotencyKey);
        if (!s) {
          if (params.expires_at <= time / 1000) throw Error('invalid expiration');
          s = { id: `cs_${sessions.size + 1}`, customer: params.customer, livemode: live, metadata: clone(params.metadata), mode: 'subscription', status: 'open', url: `https://checkout.test/${sessions.size + 1}`, subscription: null };
          sessionKeys.set(options.idempotencyKey, s); sessions.set(s.id, s);
        }
        if (faults.sessionResponse) { faults.sessionResponse = false; throw Error('response lost'); }
        return clone(s);
      },
      async retrieve(id) { if (!sessions.has(id)) throw Error('missing session'); return clone(sessions.get(id)); },
      async *list() { if (!faults.hideSessions) for (const s of sessions.values()) yield clone(s); },
    } },
  };
  return { state, store, stripe, legacy, calls, faults, customers, sessions, subscriptions, advance(ms) { time += ms; },
    run(overrides = {}, u = user) { return api.runCheckout(stripe, store, u, { ...input, ...overrides }, live, () => time); },
    sub(status, trial = false) { const s = { id: `sub_${subscriptions.length + 1}`, customer: state.customer_id, livemode: live, status, trial_start: trial ? 100 : null, trial_end: trial ? 200 : null }; subscriptions.push(s); return s; },
  };
}
const rejectsCode = (promise, code) => assert.rejects(promise, e => e.code === code);

test('first checkout and request retry return the same URL and one customer/session', async () => {
  const f = fixture(); const url = await f.run(); assert.equal(await f.run(), url);
  assert.equal(f.calls.customers.length, 1); assert.equal(f.calls.sessions.length, 1);
  const p = f.calls.sessions[0].params;
  assert.equal(p.subscription_data.trial_period_days, 14);
  assert.equal(p.success_url, 'https://example.test/billing/complete?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(p.cancel_url, 'https://example.test/upgrade?canceled=1&plan=starter&billing=monthly');
  assert.equal(p.payment_method_collection, 'always');
});
for (const failure of ['customerResponse', 'customerWrite']) test(`${failure}: recover the same customer with immutable parameters`, async () => {
  const f = fixture(); f.faults[failure] = true; await assert.rejects(f.run());
  await f.run({}, { ...user, email: 'changed@example.test' });
  assert.equal(f.customers.size, 1); assert.equal(f.calls.customers.length, 2);
  assert.deepEqual(f.calls.customers[0], f.calls.customers[1]);
});
for (const failure of ['sessionResponse', 'sessionWrite']) test(`${failure}: recover session without a second creation`, async () => {
  const f = fixture(); f.faults[failure] = true; await assert.rejects(f.run());
  await f.run(); assert.equal(f.sessions.size, 1); assert.equal(f.calls.sessions.length, 1);
});
test('missing session list response replays exactly the journal parameters', async () => {
  const f = fixture(); f.faults.sessionResponse = true; await assert.rejects(f.run()); f.faults.hideSessions = true;
  await f.run({ priceId: 'changed_price', appUrl: 'https://changed.test' });
  assert.deepEqual(f.calls.sessions[0], f.calls.sessions[1]); assert.equal(f.sessions.size, 1);
});
test('another plan cannot open a second payable session', async () => {
  const f = fixture(); await f.run(); await rejectsCode(f.run({ plan: 'growth' }), 'checkout_plan_conflict');
  assert.equal(f.sessions.size, 1);
});
for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) test(`${status} subscription blocks duplicates`, async () => {
  const f = fixture(); await f.run(); f.sub(status); await rejectsCode(f.run(), 'subscription_exists');
  assert.equal(f.sessions.size, 1);
});
test('historical trial survives canceled subscription and later missing provider history', async () => {
  const f = fixture(); await f.run(); f.sessions.get(f.state.session_id).status = 'expired'; f.sub('canceled', true);
  await f.run(); assert.equal(f.calls.sessions[1].params.subscription_data.trial_period_days, undefined);
  assert.equal(f.state.trial_used, true);
  f.sessions.get(f.state.session_id).status = 'expired'; f.subscriptions.length = 0;
  await f.run(); assert.equal(f.calls.sessions[2].params.subscription_data.trial_period_days, undefined);
});
test('all subscription history is scanned, including trial after page 100', async () => {
  const f = fixture(); await f.run(); f.sessions.get(f.state.session_id).status = 'expired';
  for (let i = 0; i < 101; i++) f.sub('canceled'); f.sub('canceled', true);
  await f.run(); assert.equal(f.calls.sessions[1].params.subscription_data.trial_period_days, undefined);
});
test('expired uncompleted checkout can retry the original Starter trial', async () => {
  const f = fixture(); await f.run(); f.sessions.get(f.state.session_id).status = 'expired'; f.advance(3600000);
  await f.run(); assert.equal(f.calls.sessions.length, 2); assert.equal(f.calls.sessions[1].params.subscription_data.trial_period_days, 14);
  assert.notEqual(f.calls.sessions[0].idempotencyKey, f.calls.sessions[1].idempotencyKey);
});
for (const plan of ['growth', 'agency']) test(`${plan} never includes a trial`, async () => {
  const f = fixture(); await f.run({ plan, billing: 'annual' });
  assert.equal(f.calls.sessions[0].params.subscription_data.trial_period_days, undefined);
});
test('completed session with pending subscription visibility fails closed', async () => {
  const f = fixture(); await f.run(); f.sessions.get(f.state.session_id).status = 'complete';
  await rejectsCode(f.run(), 'checkout_reconciliation_required'); assert.equal(f.sessions.size, 1);
});
test('completed old session allows resubscription once its actual subscription is canceled', async () => {
  const f = fixture(); await f.run(); const sub = f.sub('canceled', true);
  Object.assign(f.sessions.get(f.state.session_id), { status: 'complete', subscription: sub.id });
  await f.run(); assert.equal(f.sessions.size, 2); assert.equal(f.calls.sessions[1].params.subscription_data.trial_period_days, undefined);
});
test('untracked open subscription checkout blocks a new one', async () => {
  const f = fixture(); await f.run(); f.sessions.get(f.state.session_id).metadata = {};
  await rejectsCode(f.run(), 'checkout_already_open'); assert.equal(f.sessions.size, 1);
});
test('ambiguous customer older than idempotency window is never recreated', async () => {
  const f = fixture(); f.faults.customerResponse = true; await assert.rejects(f.run()); f.advance(24 * 3600000);
  await rejectsCode(f.run(), 'checkout_reconciliation_required'); assert.equal(f.calls.customers.length, 1);
});
test('ambiguous old session absent from provider listing is never recreated', async () => {
  const f = fixture(); f.faults.sessionResponse = true; await assert.rejects(f.run()); f.advance(24 * 3600000); f.faults.hideSessions = true;
  await rejectsCode(f.run(), 'checkout_reconciliation_required'); assert.equal(f.calls.sessions.length, 1);
});
test('live mode reuses and verifies existing production customer and subscription', async () => {
  const f = fixture(true); f.legacy.stripe_customer_id = 'cus_live'; f.customers.set('cus_live', { id: 'cus_live', livemode: true, metadata: {} });
  await f.run(); assert.equal(f.calls.customers.length, 0); const sub = f.sub('active'); f.legacy.stripe_subscription_id = sub.id;
  await rejectsCode(f.run(), 'subscription_exists'); assert.deepEqual(f.calls.subscriptionReads, [sub.id]);
});
test('test provider cannot adopt a production customer mapping', async () => {
  const f = fixture(); f.legacy.stripe_customer_id = 'cus_live'; f.legacy.stripe_subscription_id = 'sub_live';
  await assert.rejects(f.run(), /missing customer/); assert.equal(f.calls.customers.length, 0); assert.equal(f.sessions.size, 0);
});
test('wrong-mode provider customer fails closed', async () => {
  const f = fixture(true); f.legacy.stripe_customer_id = 'cus_wrong'; f.customers.set('cus_wrong', { id: 'cus_wrong', livemode: false, metadata: {} });
  await rejectsCode(f.run(), 'checkout_reconciliation_required'); assert.equal(f.sessions.size, 0);
});
// Exercise the production store adapter, advisory contention, and CAS writes.
// SQL replies are controlled, not an emulation of PostgreSQL isolation.
function database(f) {
  let locked = false;
  let row = null;
  let hook;
  const users = { stripe_customer_id: null, stripe_subscription_id: null };
  const statements = [];
  const db = {
    withTx: async fn => {
      let owned = false;
      try { return await fn({ query: async q => {
        if (q.includes('pg_try_advisory_xact_lock')) {
          if (locked) return { rows: [{ locked: false }] };
          owned = locked = true; return { rows: [{ locked: true }] };
        }
        return { rows: [{}] };
      } }); } finally { if (owned) locked = false; }
    },
    requireSql: () => ({ query: async (q, v) => {
      statements.push(q);
      if (hook) await hook(q, v);
      if (q.startsWith('INSERT INTO billing_checkout_state')) {
        row ||= { ...structuredClone(f.state), customer_operation: v[2], customer_params: JSON.parse(v[3]), customer_started_at: new Date().toISOString() }; return [];
      }
      if (q.startsWith('SELECT *')) return [structuredClone(row)];
      if (q.startsWith('SELECT stripe_customer_id')) return [structuredClone(users)];
      if (q.includes('SET customer_id')) { if (row.customer_id && row.customer_id !== v[2]) return []; row.customer_id = v[2]; return [{ user_id: v[0] }]; }
      if (q.includes('UPDATE users')) { if (users.stripe_customer_id && users.stripe_customer_id !== v[1]) return []; users.stripe_customer_id = v[1]; return [{ id: v[0] }]; }
      if (q.includes('SET trial_used')) { row.trial_used = true; return []; }
      if (q.includes('SET session_operation')) {
        assert.match(q, /session_operation IS NOT DISTINCT FROM \$5::uuid/);
        if (row.session_operation !== v[4]) return [];
        row.session_operation = v[2]; row.session_params = JSON.parse(v[3]); row.session_started_at = new Date().toISOString(); row.session_id = null; return [{ user_id: v[0] }];
      }
      if (q.includes('SET session_id')) {
        assert.match(q, /session_operation = \$4::uuid/);
        if (row.session_operation !== v[3]) return [];
        row.session_id = v[2]; return [{ user_id: v[0] }];
      }
      throw Error(`Unhandled SQL ${q}`);
    } }),
  };
  return { api: load(db), users, statements, get row() { return row; }, setHook(h) { hook = h; } };
}
async function withKey(key, fn) {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = key;
  try { await fn(); } finally { if (previous === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previous; }
}
test('concurrent first requests have one lock owner; retry resumes the one customer/session', async () => {
  await withKey('sk_live_fake', async () => {
    const f = fixture(true); const d = database(f);
    let release; const gate = new Promise(r => { release = r; });
    let entered; const waiting = new Promise(r => { entered = r; });
    const create = f.stripe.customers.create;
    f.stripe.customers.create = async (...args) => { entered(); await gate; return create(...args); };
    const first = d.api.createBillingCheckout(f.stripe, user, input);
    await waiting;
    await rejectsCode(d.api.createBillingCheckout(f.stripe, user, input), 'checkout_busy');
    release(); const url = await first;
    assert.equal(await d.api.createBillingCheckout(f.stripe, user, input), url);
    assert.equal(f.customers.size, 1); assert.equal(f.sessions.size, 1);
    assert.equal(d.users.stripe_customer_id, 'cus_1');
  });
});
test('journal survives rollback of lock transaction after lost Stripe response', async () => {
  await withKey('sk_live_fake', async () => {
    const f = fixture(true); const d = database(f); f.faults.customerResponse = true;
    await assert.rejects(d.api.createBillingCheckout(f.stripe, user, input));
    const operation = d.row.customer_operation;
    await d.api.createBillingCheckout(f.stripe, user, input);
    assert.equal(d.row.customer_operation, operation); assert.equal(f.customers.size, 1);
    assert.equal(d.users.stripe_customer_id, 'cus_1');
  });
});
test('stale attempt writer cannot overwrite a successor or create a second session', async () => {
  await withKey('sk_live_fake', async () => {
    const f = fixture(true); const d = database(f);
    d.setHook(async q => { if (q.includes('SET session_operation')) d.row.session_operation = 'new-owner-operation'; });
    await rejectsCode(d.api.createBillingCheckout(f.stripe, user, input), 'checkout_reconciliation_required');
    assert.equal(d.row.session_operation, 'new-owner-operation'); assert.equal(f.sessions.size, 0);
  });
});
test('stale session-result writer cannot attach its session to a newer operation', async () => {
  await withKey('sk_live_fake', async () => {
    const f = fixture(true); const d = database(f);
    d.setHook(async q => { if (q.includes('SET session_id')) d.row.session_operation = 'new-owner-operation'; });
    await rejectsCode(d.api.createBillingCheckout(f.stripe, user, input), 'checkout_reconciliation_required');
    assert.equal(d.row.session_id, null);
  });
});

test('legacy checkout completed during subscription listing cannot create a duplicate', async () => {
  const f = fixture(); await f.run(); const sub = f.sub('active');
  Object.assign(f.sessions.get(f.state.session_id), { status: 'complete', subscription: sub.id, metadata: {} });
  f.stripe.subscriptions.list = async function* () {}; // Simulate list/completion race.
  await rejectsCode(f.run(), 'subscription_exists'); assert.equal(f.sessions.size, 1);
});
test('legacy completion without visible subscription fails closed', async () => {
  const f = fixture(); await f.run(); Object.assign(f.sessions.get(f.state.session_id), { status: 'complete', metadata: {} });
  await rejectsCode(f.run(), 'checkout_reconciliation_required'); assert.equal(f.sessions.size, 1);
});


test('test key is refused before accessing production database or Stripe', async () => {
  await withKey('sk_test_fake', async () => {
    const f = fixture();
    const guarded = load({ requireSql() { throw Error('must not access production database'); } });
    await assert.rejects(guarded.createBillingCheckout(f.stripe, user, input), /environment mismatch/);
    assert.equal(f.calls.customers.length, 0); assert.equal(f.calls.sessions.length, 0);
  });
});
test('explicit isolated-test environment permits test checkout and preserves completion mapping', async () => {
  const before = process.env.BILLING_DATA_ENVIRONMENT;
  process.env.BILLING_DATA_ENVIRONMENT = 'isolated_test';
  try {
    await withKey('sk_test_fake', async () => {
      const f = fixture(); const d = database(f); await d.api.createBillingCheckout(f.stripe, user, input);
      assert.equal(d.users.stripe_customer_id, 'cus_1');
      assert.equal(f.calls.sessions[0].params.metadata.app_user_id, user.id);
    });
  } finally {
    if (before === undefined) delete process.env.BILLING_DATA_ENVIRONMENT;
    else process.env.BILLING_DATA_ENVIRONMENT = before;
  }
});

// Route guards must precede lazy requireUser, which can upsert production data.
test('checkout route rejects shared-data test key before authentication side effects', async () => {
  await withKey('sk_test_fake', async () => {
    let authenticated = 0;
    const route = loadFile('app/api/billing/checkout/route.ts', {
      zod: require('zod'), '@/lib/billing-mode': loadFile('lib/billing-mode.ts'),
      '@/lib/billing-checkout': api,
      '@/lib/clerk-user': { requireUser() { authenticated++; throw Error('must not authenticate'); } },
      '@/lib/stripe': { stripe: {}, requireStripe() { throw Error('must not access Stripe'); } },
      '@/lib/api': { json: (body, init) => new Response(JSON.stringify(body), init) },
    });
    const response = await route.POST(new Request('https://example.test/api/billing/checkout', { method: 'POST' }));
    assert.equal(response.status, 503); assert.equal(authenticated, 0);
  });
});
