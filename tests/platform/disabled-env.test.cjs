const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const env = loadTs('lib/env.ts');
const DISABLED = '__ISSUEFY_DISABLED__';
function setEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const prior = process.env[key];
    t.after(() => prior === undefined ? delete process.env[key] : process.env[key] = prior);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
const noFetch = { fetchWithTimeout: () => { throw new Error('Unexpected provider call'); } };

test('only the exact sentinel is treated as unset', () => {
  for (const value of [undefined, '', 'real-key', ' __ISSUEFY_DISABLED__', '__ISSUEFY_DISABLED__x']) {
    assert.equal(env.configuredEnv(value), value);
  }
  assert.equal(env.configuredEnv(DISABLED), undefined);
});

for (const value of [undefined, DISABLED]) {
  test(`cron and worker auth fail closed for ${value}`, (t) => {
    setEnv(t, { CRON_SECRET: value, INTERNAL_WORKER_SECRET: value });
    const guards = loadTs('lib/cron-auth.ts', { './env': env });
    for (const guard of [guards.checkCronSecret, guards.checkInternalSecret]) {
      for (const token of [DISABLED, 'arbitrary', '']) {
        assert.equal(guard(new Request('https://test.invalid', { headers: { authorization: `Bearer ${token}` } })).status, 503);
      }
    }
  });
  test(`disabled/absent provider credentials do not reach a transport: ${value}`, async (t) => {
    setEnv(t, { SCRAPERAPI_KEY: value, APIFY_TOKEN: value, OPENROUTER_API_KEY: value });
    const mocks = { './env': env, './fetch': noFetch, './serp-url': loadTs('lib/serp-url.ts', { './social-url': loadTs('lib/social-url.ts') }) };
    const scraper = loadTs('lib/scraperapi.ts', mocks);
    await assert.rejects(scraper.standardScrape({ url: 'https://test.invalid' }), /SCRAPERAPI_KEY is not configured/);
    const apify = loadTs('lib/apify.ts', mocks);
    assert.equal(apify.apifyEnabled(), false);
    await assert.rejects(apify.searchRedditViaApify('test'), /APIFY_TOKEN is not configured/);
    const router = loadTs('lib/openrouter.ts', mocks);
    await assert.rejects(router.chatJson({}), /OPENROUTER_API_KEY is not configured/);
  });
  test(`billing email does not construct a client for ${value}`, async (t) => {
    setEnv(t, { RESEND_API_KEY: value });
    const billing = loadTs('lib/billing/notifications.ts', {
      '../env': env, resend: { Resend: class { constructor() { throw new Error('Unexpected mail client'); } } },
    });
    await assert.rejects(billing.sendBillingNotification({}), /Billing email is not configured/);
  });
}

test('normal API key survives and disabled model values use existing defaults', async (t) => {
  setEnv(t, { OPENROUTER_API_KEY: 'synthetic-key', OPENROUTER_MODEL_PRIMARY: DISABLED, OPENROUTER_MODEL_FALLBACK: DISABLED });
  let request;
  const router = loadTs('lib/openrouter.ts', { './env': env, './fetch': {
    fetchWithTimeout: async (_url, init) => { request = init; return new Response(JSON.stringify({ model: 'test-model', choices: [{ message: { content: '{}' } }] })); },
  } });
  await router.chatJson({ messages: [], schemaName: 'test', jsonSchema: {}, zodSchema: { safeParse: v => ({ success: true, data: v }) } });
  assert.equal(request.headers.Authorization, 'Bearer synthetic-key');
  assert.deepEqual(JSON.parse(request.body).models, ['google/gemini-2.0-flash-001', 'openai/gpt-4o-mini']);
});

test('billing retains normal key and uses default sender when disabled', async (t) => {
  setEnv(t, { RESEND_API_KEY: 'synthetic-mail-key', RESEND_FROM_EMAIL: DISABLED });
  let sent;
  const billing = loadTs('lib/billing/notifications.ts', { '../env': env, resend: { Resend: class {
    constructor(key) { assert.equal(key, 'synthetic-mail-key'); }
    emails = { send: async message => { sent = message; return {}; } };
  } } });
  await billing.sendBillingNotification({ kind: 'canceled', recipient: 'test@example.invalid', event_id: 'test' });
  assert.equal(sent.from, 'Issuefy <hello@issuefy.app>');
});

for (const file of ['sentry.server.config.ts', 'sentry.edge.config.ts', 'sentry.client.config.ts']) {
  test(`${file} ignores disabled DSNs and initializes with normal DSN`, (t) => {
    setEnv(t, { SENTRY_DSN: DISABLED, NEXT_PUBLIC_SENTRY_DSN: DISABLED });
    const calls = [];
    const mocks = { './lib/env': env, '@sentry/nextjs': {
      init: options => calls.push(options), lazyLoadIntegration: async () => () => ({}), addIntegration() {},
    } };
    loadTs(file, mocks);
    assert.equal(calls.length, 0);
    process.env.SENTRY_DSN = 'https://synthetic@example.invalid/1';
    loadTs(file, mocks);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].dsn, process.env.SENTRY_DSN);
  });
}

for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
  test(`disabled ${key} prevents an R2 SDK call even when enabled`, async (t) => {
    setEnv(t, { R2_ENABLED: 'true', R2_ACCOUNT_ID: 'synthetic', R2_ACCESS_KEY_ID: 'synthetic', R2_SECRET_ACCESS_KEY: 'synthetic', R2_BUCKET: 'synthetic', [key]: DISABLED });
    let calls = 0;
    const storage = loadTs('lib/storage.ts', { './env': env, '@aws-sdk/client-s3': { S3Client: class { constructor() { calls++; } } } });
    assert.equal(await storage.archiveRawHtml('test', 'html'), null);
    assert.equal(calls, 0);
  });
}

test('product mailer does not construct a Resend client with disabled key', (t) => {
  setEnv(t, { RESEND_API_KEY: DISABLED, RESEND_FROM_EMAIL: DISABLED });
  let clients = 0;
  loadTs('lib/mailer.ts', {
    './env': env, resend: { Resend: class { constructor() { clients++; } } },
    './daily-brief-email': {}, './invitation-email': {}, './lapse-email': {},
    './sentry': { captureBreadcrumb() {} }, './support-emails': {},
  });
  assert.equal(clients, 0);
});

test('Sentry wrapper does not emit when disabled', (t) => {
  setEnv(t, { SENTRY_DSN: DISABLED });
  let calls = 0;
  const sentry = loadTs('lib/sentry.ts', { './env': env, '@sentry/nextjs': {
    captureException() { calls++; }, addBreadcrumb() { calls++; },
  } });
  sentry.captureError(new Error('synthetic'));
  sentry.captureBreadcrumb('synthetic');
  assert.equal(calls, 0);
});
