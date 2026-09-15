import test from 'node:test';
import assert from 'node:assert/strict';
import { PIN, buildEnvironment, validateSnapshot, invokeOnce, runtime } from './demo-brief.mjs';

const staging = () => ({ DATABASE_URL: `postgresql://user:secret@${PIN.host}/${PIN.database}?sslmode=require&channel_binding=require`,
  STRIPE_SECRET_KEY: 'sk_test_fake', BILLING_DATA_ENVIRONMENT: 'isolated_test' });
const providers = { SCRAPERAPI_KEY: 'scrape-fake', OPENROUTER_API_KEY: 'router-fake',
  OPENROUTER_MODEL_PRIMARY: PIN.primary, OPENROUTER_MODEL_FALLBACK: PIN.fallback, RESEND_API_KEY: 'must-not-inherit' };
const fixture = () => ({ project: { id: PIN.project, user_id: 'owner', name: 'Linear — Issuefy Demo', company_name: 'Linear — Issuefy Demo',
  company_website: null, company_description: 'Demo evaluation of issue tracking and product planning software for software teams.',
  industry: 'Software development and work management', business_type: 'SaaS', target_market: 'GLOBAL', is_active: true,
  last_manual_refresh_at: null, last_scraped_at: null },
  owner: { id: 'owner', email: PIN.email, role: 'user', plan: 'starter', subscription_status: 'trialing',
    stripe_subscription_id: 'sub_test', stripe_customer_id: 'cus_test', email_brief_enabled: false }, owner_member: true,
  competitors: [{ name: 'Atlassian', website_url: 'https://atlassian.com/software/jira', is_active: true },
    { name: 'Asana', website_url: 'https://asana.com/', is_active: true }],
  keywords: ['AI project management', 'developer workflow automation', 'issue tracking pricing'].map(keyword => ({ keyword, is_active: true, last_discovered_at: null })),
  source_count: 0, job_count: 0, signal_count: 0, summary_count: 0 });
const market = { matched: true, langs: ['en'] };

test('environment rejects alternate DB targets/options, live/disabled billing and unexpected effects', () => {
  const safe = buildEnvironment(staging(), providers);
  assert.equal(safe.RESEND_API_KEY, undefined);
  assert.equal(safe.R2_ENABLED, 'false');
  assert.equal(safe.APP_URL, 'http://localhost:3001');
  assert.equal(safe.OPENROUTER_MODEL_PRIMARY, PIN.fallback);
  assert.equal(safe.OPENROUTER_MODEL_FALLBACK, PIN.fallback);
  for (const override of [
    { DATABASE_URL: staging().DATABASE_URL.replace(PIN.host, 'production.neon.tech') },
    { DATABASE_URL: staging().DATABASE_URL.replace(PIN.database, 'neondb') },
    { DATABASE_URL: staging().DATABASE_URL + '&host=production.neon.tech' },
    { DATABASE_URL: staging().DATABASE_URL + '&options=-csearch_path=other' },
    { STRIPE_SECRET_KEY: '' }, { STRIPE_SECRET_KEY: 'sk_live_fake' },
    { BILLING_DATA_ENVIRONMENT: 'production' }, { VERCEL_ENV: 'production' },
    { RESEND_API_KEY: 'mail' }, { R2_ENABLED: 'true' }, { SENTRY_DSN: 'telemetry' }, { BETA_STARTER_LIMITS: 'false' },
  ]) assert.throws(() => buildEnvironment({ ...staging(), ...override }, providers));
  assert.throws(() => buildEnvironment(staging(), { ...providers, OPENROUTER_MODEL_PRIMARY: '' }));
});

test('fresh pinned shape required; unsafe state fails closed', () => {
  assert.equal(validateSnapshot(fixture(), market).expectedRequests.scrapeAtMost, 11);
  for (const mutate of [
    s => s.owner.email = 'other@example.com', s => s.owner.role = 'admin', s => s.owner.email_brief_enabled = true,
    s => s.owner.subscription_status = 'canceled', s => s.owner_member = false,
    s => s.project.is_active = false, s => s.project.company_website = 'https://other.com',
    s => s.project.company_socials = { reddit: 'https://reddit.com/r/demo' },
    s => s.competitors[0].socials = { youtube: 'https://youtube.com/test' },
    s => s.competitors[0].website_url = 'https://atlassian.com.evil.test/software/jira',
    s => s.keywords.push(s.keywords[0]), s => s.keywords[0].last_discovered_at = '2026-09-15',
    s => s.keywords[0].keyword = 'other', s => s.source_count = 1, s => s.job_count = 1,
    s => s.summary_count = 1, s => s.project.last_manual_refresh_at = '2026-09-15',
  ]) { const s = fixture(); mutate(s); assert.throws(() => validateSnapshot(s, market)); }
  assert.throws(() => validateSnapshot(fixture(), { matched: true, langs: ['en', 'ar'] }));
});

test('claim refusal never executes worker; success consumes exactly one real claim ID', async () => {
  let claims = 0, workers = 0;
  assert.equal(await invokeOnce('owner', async () => { claims++; return new Response('quota', { status: 429 }); },
    async () => { workers++; }, () => {}), 2);
  assert.equal(claims, 1); assert.equal(workers, 0);
  const events = [];
  const result = { status: 'completed', errors: ['provider unavailable'], signalsInserted: 0, signalsRejected: 0, modelUsed: null, summaryStatus: 'skipped' };
  assert.equal(await invokeOnce('owner', async (...args) => { assert.deepEqual(args, ['owner', PIN.project, false]); return { jobId: 'claim' }; },
    async (...args) => { workers++; assert.deepEqual(args, [PIN.project, 'manual', 'claim']); return result; }, x => events.push(x)), 2);
  assert.equal(workers, 1); assert.deepEqual(events[1].result, result);
  await assert.rejects(invokeOnce('owner', async () => { throw new Error('DB failed'); }, async () => { workers++; }, () => {}));
  assert.equal(workers, 1);
});

test('runtime loads actual worker/claim graph with providers disabled, without invoking them', () => {
  const original = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    const load = runtime();
    assert.equal(load('lib/markets.ts').resolveMarket('GLOBAL').langs.join(','), 'en');
    assert.equal(typeof load('lib/entitlement-claims.ts').claimManualRefresh, 'function');
    assert.equal(typeof load('lib/process-project.ts').processProject, 'function');
  } finally { Object.assign(process.env, original); }
});
