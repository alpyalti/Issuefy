import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await fs.readFile(new URL('../../app/api/webhooks/stripe/route.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

const helperSource = await fs.readFile(new URL('../../lib/billing-mode.ts', import.meta.url), 'utf8');
const helperOutput = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Execute the actual route with isolated env and explicit provider/module mocks.
// Nothing imports the real DB/Stripe SDK or uses process credentials.
function route({ key = 'sk_live_fixture', mode = true, environment = 'production', dataEnvironment, includeMode = true, validSignature = true } = {}) {
  const calls = { process: 0, outbox: 0, transaction: 0, retrieve: 0 };
  const event = { id: 'evt_fixture', type: 'checkout.session.completed', livemode: mode,
    data: { object: { metadata: { plan: 'agency', livemode: 'true' } } } };
  if (!includeMode) delete event.livemode;
  const context = { Response, process: { env: { STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_SECRET_KEY: key, VERCEL_ENV: environment, BILLING_DATA_ENVIRONMENT: dataEnvironment } } };
  const helper = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${helperOutput}\n})`, context)(helper, helper.exports);
  const mocks = {
    '@/lib/billing-mode': helper.exports,
    '@/lib/stripe': { stripe: {
      webhooks: { constructEvent: () => { if (!validSignature) throw new Error('bad signature'); return event; } },
      subscriptions: { retrieve: async () => { calls.retrieve++; } },
    }, planFromPriceId: () => 'agency' },
    '@/lib/db': { withTx: async () => { calls.transaction++; } },
    '@/lib/sentry': { captureError: () => {} },
    '@/lib/billing/webhook': {
      processBillingEvent: async () => { calls.process++; return 'processed'; },
      deliverBillingNotifications: async () => { calls.outbox++; },
    },
    '@/lib/billing/notifications': { sendBillingNotification: async () => { throw new Error('Must not send real mail'); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${outputText}\n})`, {
    ...context,
  })(id => { assert.ok(Object.hasOwn(mocks, id), `Unmocked import ${id}`); return mocks[id]; }, module, module.exports);
  return { calls, invoke: () => module.exports.POST(new Request('https://example.invalid/api/webhooks/stripe', {
    method: 'POST', headers: { 'stripe-signature': 'fixture' }, body: '{}',
  })) };
}

for (const environment of ['production', 'preview', 'development', null]) {
  test(`test event cannot enter billing in ${environment ?? 'unclassified runtime'}, despite checkout metadata`, async () => {
    const f = route({ environment, mode: false });
    assert.equal((await f.invoke()).status, 400);
    assert.deepEqual(f.calls, { process: 0, outbox: 0, transaction: 0, retrieve: 0 });
  });
}
for (const key of ['sk_test_fixture', 'rk_test_fixture', '', 'unrecognized']) {
  test(`non-live key configuration fails closed (${key || 'missing'})`, async () => {
    const f = route({ key, mode: true });
    assert.equal((await f.invoke()).status, 503);
    assert.deepEqual(f.calls, { process: 0, outbox: 0, transaction: 0, retrieve: 0 });
  });
}
test('preview test key plus test event cannot write shared production data', async () => {
  const f = route({ environment: 'preview', key: 'sk_test_fixture', mode: false });
  assert.equal((await f.invoke()).status, 503);
  assert.equal(f.calls.process, 0); assert.equal(f.calls.outbox, 0);
});
for (const key of ['sk_live_fixture', 'rk_live_fixture']) {
  test(`verified live event with ${key} reaches normal processing`, async () => {
    const f = route({ key });
    assert.equal((await f.invoke()).status, 200);
    assert.equal(f.calls.process, 1); assert.equal(f.calls.outbox, 1);
  });
}
test('malformed mode is rejected and signature validation still precedes guard', async () => {
  const malformed = route({ mode: 'true' });
  assert.equal((await malformed.invoke()).status, 400); assert.equal(malformed.calls.process, 0);
  const invalid = route({ mode: true, validSignature: false });
  assert.equal(await (await invalid.invoke()).text(), 'Invalid signature'); assert.equal(invalid.calls.process, 0);
});

for (const environment of ['preview', 'development']) {
  test(`explicit isolated test environment permits matching test event in ${environment}`, async () => {
    const f = route({ environment, dataEnvironment: 'isolated_test', key: 'sk_test_fixture', mode: false });
    assert.equal((await f.invoke()).status, 200); assert.equal(f.calls.process, 1);
  });
}
for (const options of [
  { environment: 'production', dataEnvironment: 'isolated_test', key: 'sk_test_fixture', mode: false },
  { environment: 'production', dataEnvironment: 'isolated_test', key: 'sk_live_fixture', mode: true },
  { environment: 'preview', dataEnvironment: 'isolated_test', key: 'sk_live_fixture', mode: true },
  { environment: 'preview', dataEnvironment: 'unknown', key: 'sk_live_fixture', mode: true },
]) {
  test(`invalid isolation/key configuration rejects before mutations: ${JSON.stringify(options)}`, async () => {
    const f = route(options); assert.equal((await f.invoke()).status, 503);
    assert.deepEqual(f.calls, { process: 0, outbox: 0, transaction: 0, retrieve: 0 });
  });
}
test('isolated test key rejects live event', async () => {
  const f = route({ environment: 'preview', dataEnvironment: 'isolated_test', key: 'rk_test_fixture', mode: true });
  assert.equal((await f.invoke()).status, 400); assert.equal(f.calls.process, 0);
});

test('missing event livemode fails closed before any processing', async () => {
  const f = route({ includeMode: false });
  assert.equal((await f.invoke()).status, 400);
  assert.deepEqual(f.calls, { process: 0, outbox: 0, transaction: 0, retrieve: 0 });
});
