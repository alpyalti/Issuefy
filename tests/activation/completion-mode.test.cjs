const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const helper = loadTs('lib/billing-mode.ts');
const keys = ['BILLING_DATA_ENVIRONMENT', 'VERCEL_ENV', 'STRIPE_SECRET_KEY'];
async function withEnv(env, fn) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    return await fn();
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
}
function fixture({ sessionLive = true, subscriptionLive = true, id = 'cs_live_ok', admin = false } = {}) {
  const calls = { identity: 0, requireUser: 0, db: 0, provider: 0 };
  const session = { id, livemode: sessionLive, customer: 'cus_mine', mode: 'subscription', metadata: { app_user_id: 'u' }, status: 'complete', payment_status: 'paid',
    subscription: { id: 'sub_mine', livemode: subscriptionLive, status: 'active', items: { data: [{ price: { id: 'price_mine', recurring: { interval: 'month' } } }] } } };
  const completion = loadTs('lib/checkout-completion.ts', {
    '@/lib/billing-mode': helper,
    '@/lib/stripe': { stripe: { checkout: { sessions: { retrieve: async () => { calls.provider++; return session; } } } }, planFromPriceId: () => 'growth' },
    '@/lib/db': { requireSql: () => async () => { calls.db++; return [{ role: admin ? 'admin' : 'user', stripe_customer_id: 'cus_mine', stripe_subscription_id: 'sub_mine', subscription_status: 'active', plan: 'growth' }]; } },
  });
  const route = loadTs('app/api/billing/completion/route.ts', {
    '@/lib/checkout-completion': completion,
    '@clerk/nextjs/server': { auth: async () => { calls.identity++; return { userId: 'clerk_u' }; } },
    '@/lib/clerk-user': { requireUser: async () => { calls.requireUser++; return { id: 'u' }; } },
    '@/lib/api': { json: (data, opts) => new Response(JSON.stringify(data), opts) },
  });
  return { calls, completion, route, session };
}
for (const deployment of ['production', 'preview']) {
  test(`${deployment}: test session hint rejected before identity, upsert, provider or account reads`, async () => {
    await withEnv({ VERCEL_ENV: deployment, STRIPE_SECRET_KEY: 'sk_live_fixture' }, async () => {
      const f = fixture({ admin: true });
      const res = await f.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_test_other'));
      assert.equal(res.status, 400);
      assert.deepEqual(f.calls, { identity: 0, requireUser: 0, db: 0, provider: 0 });
    });
  });
  test(`${deployment}: test configuration with shared default fails before side effects`, async () => {
    await withEnv({ VERCEL_ENV: deployment, STRIPE_SECRET_KEY: 'sk_test_fixture' }, async () => {
      const f = fixture();
      assert.equal((await f.route.GET(new Request('https://example.com/api/billing/completion'))).status, 503);
      assert.equal(f.calls.requireUser, 0); assert.equal(f.calls.db, 0); assert.equal(f.calls.provider, 0);
    });
  });
}
test('returned session and subscription false/missing modes rejected before upsert and DB, including admin', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'rk_live_fixture' }, async () => {
    for (const field of ['session', 'subscription']) {
      for (const value of [false, undefined]) {
        const f = fixture({ admin: true });
        if (field === 'session') f.session.livemode = value; else f.session.subscription.livemode = value;
        assert.equal((await f.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_live_ok'))).status, 400);
        assert.equal(f.calls.requireUser, 0); assert.equal(f.calls.db, 0);
        await assert.rejects(f.completion.checkoutCompletion('u', 'cs_live_ok'));
        assert.equal(f.calls.db, 0);
      }
    }
  });
});
test('matching live session reaches ready after mode preflight', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'sk_live_fixture', VERCEL_ENV: 'preview' }, async () => {
    const f = fixture();
    const res = await f.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_live_ok'));
    assert.equal(res.status, 200); assert.equal((await res.json()).status, 'ready');
    assert.equal(f.calls.provider, 1); assert.equal(f.calls.requireUser, 1);
  });
});
test('explicit isolated_test accepts only test objects and rejects production deployment', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'sk_test_fixture', BILLING_DATA_ENVIRONMENT: 'isolated_test' }, async () => {
    const f = fixture({ id: 'cs_test_ok', sessionLive: false, subscriptionLive: false });
    assert.equal((await f.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_test_ok'))).status, 200);
    f.session.livemode = true;
    assert.equal((await f.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_test_ok'))).status, 400);
    process.env.VERCEL_ENV = 'production';
    const blocked = fixture();
    assert.equal((await blocked.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_test_ok'))).status, 503);
    assert.equal(blocked.calls.requireUser, 0);
  });
});
test('completion page rejects mode before rendering polling client, with no lazy user helper', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'sk_live_fixture', VERCEL_ENV: 'preview' }, async () => {
    const f = fixture();
    const Component = () => {};
    const page = loadTs('app/billing/complete/page.tsx', {
      '@/lib/checkout-completion': f.completion,
      './CheckoutCompletion': Component, '../../dashboard.css': {},
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    }).default;
    const result = await page({ searchParams: Promise.resolve({ session_id: 'cs_test_wrong' }) });
    assert.equal(result.type, 'main');
    assert.equal(f.calls.db, 0);
  });
});

test('unexpanded subscription rejects before lazy user creation', async () => {
  await withEnv({ STRIPE_SECRET_KEY: 'sk_live_fixture' }, async () => {
    const f = fixture({ admin: true });
    f.session.subscription = 'sub_mine';
    assert.equal((await f.route.GET(new Request('https://example.com/api/billing/completion?session_id=cs_live_ok'))).status, 400);
    assert.equal(f.calls.requireUser, 0); assert.equal(f.calls.db, 0);
  });
});
