import test from 'node:test';
import assert from 'node:assert/strict';
import { PIN, validateSnapshot } from './demo-brief.mjs';
import { OWNER, mode, dailyEnvironment, validateDaily, executeDaily } from './demo-daily.mjs';
const market = { matched: true, langs: ['en'] };
function fixture() {
  return { project: { id: PIN.project, user_id: OWNER, name: 'Linear — Issuefy Demo', company_name: 'Linear — Issuefy Demo',
    company_website: null, company_description: 'Demo evaluation of issue tracking and product planning software for software teams.',
    industry: 'Software development and work management', business_type: 'SaaS', target_market: 'GLOBAL', is_active: true,
    last_manual_refresh_at: '2026-09-15', last_scraped_at: '2026-09-15' },
    owner: { id: OWNER, email: PIN.email, role: 'user', plan: 'starter', subscription_status: 'trialing',
      stripe_subscription_id: 'sub_test', stripe_customer_id: 'cus_test', email_brief_enabled: false }, owner_member: true,
    competitors: [{ name: 'Atlassian', website_url: 'https://atlassian.com/software/jira', is_active: true },
      { name: 'Asana', website_url: 'https://asana.com/', is_active: true }],
    keywords: ['AI project management', 'developer workflow automation', 'issue tracking pricing'].map(keyword => ({ keyword, is_active: true, last_discovered_at: '2026-09-15' })),
    source_count: 10, job_count: 1, signal_count: 4, summary_count: 1,
    utc_day: '2026-09-16', jobs_today: 0, active_jobs: 0, eligible_sources: 10 };
}
const staging = { DATABASE_URL: `postgresql://user:synthetic@${PIN.host}/${PIN.database}?sslmode=require`,
  STRIPE_SECRET_KEY: 'sk_test_synthetic', BILLING_DATA_ENVIRONMENT: 'isolated_test' };
const providers = { SCRAPERAPI_KEY: 'synthetic-scraper', OPENROUTER_API_KEY: 'synthetic-router',
  OPENROUTER_MODEL_PRIMARY: PIN.primary, OPENROUTER_MODEL_FALLBACK: PIN.fallback };

test('only explicit run opts in; unknown/repeated modes fail closed', () => {
  assert.equal(mode([]), 'dry-run'); assert.equal(mode(['--run']), 'run');
  for (const args of [['run'], ['--force'], ['--run','--run'], ['--day','2026-09-15']]) assert.throws(() => mode(args));
});
test('environment pins and allowlist exclude inherited auth/social/mail/storage', () => {
  const safe = dailyEnvironment({ ...staging, CLERK_SECRET_KEY: 'excluded', CRON_SECRET: 'excluded' },
    { ...providers, APIFY_TOKEN: 'excluded', RESEND_API_KEY: 'excluded', DATABASE_URL: 'production' });
  for (const key of ['CLERK_SECRET_KEY','CRON_SECRET','APIFY_TOKEN','RESEND_API_KEY','SENTRY_DSN','R2_ACCESS_KEY_ID']) assert.equal(safe[key], undefined);
  assert.equal(safe.R2_ENABLED, 'false');
  assert.equal(new URL(safe.DATABASE_URL).hostname, PIN.host);
  assert.equal(safe.OPENROUTER_MODEL_PRIMARY, PIN.fallback);
  for (const change of [{ DATABASE_URL: staging.DATABASE_URL.replace(PIN.host,'production.example') },
    { BILLING_DATA_ENVIRONMENT: 'production' }, { STRIPE_SECRET_KEY: 'sk_live_synthetic' }, { RESEND_API_KEY: 'enabled' }]) {
    assert.throws(() => dailyEnvironment({ ...staging, ...change }, providers));
  }
  for (const key of ['SCRAPERAPI_KEY','OPENROUTER_API_KEY']) assert.throws(() => dailyEnvironment(staging, { ...providers, [key]: '__ISSUEFY_DISABLED__' }));
});
test('history is preserved; the original fresh-only guard still rejects it', () => {
  const state = fixture(), before = structuredClone(state);
  assert.equal(validateDaily(state, market).expectedRequests.scrapeAtMost, 21);
  assert.deepEqual(state, before);
  assert.throws(() => validateSnapshot(state, market));
});
test('identity/configuration/paused/social/mail/day guards reject changes', () => {
  for (const mutate of [s => s.owner.id = 'other', s => s.owner.email = 'other@example.com', s => s.project.user_id = 'other',
    s => s.project.id = 'other', s => s.project.is_active = false, s => s.owner.subscription_status = 'paused',
    s => s.owner.email_brief_enabled = true, s => s.project.company_socials = { reddit: 'https://reddit.com/r/test' },
    s => s.competitors[0].website_url = 'https://other.com', s => s.keywords[0].keyword = 'changed',
    s => s.owner.plan = 'growth', s => s.jobs_today = 1, s => s.active_jobs = 1, s => s.utc_day = undefined]) {
    const state = fixture(); mutate(state); assert.throws(() => validateDaily(state, market));
  }
});
// Simulated session lock and durable job store exercise runner ordering and
// retries without opening a database or executing providers. PostgreSQL's
// lock implementation itself is not validated by this unit harness.
function harness() {
  const state = fixture(), jobs = [];
  let lock = false, claims = 0, workers = 0;
  const client = { async query(sql, params) {
    if (sql.includes('pg_try_advisory_lock')) { const acquired = !lock; lock ||= acquired; return { rows: [{ locked: acquired }] }; }
    if (sql.includes('pg_advisory_unlock')) { lock = false; return { rows: [] }; }
    assert.match(sql, /SELECT to_jsonb/); assert.deepEqual(params, [PIN.project]);
    return { rows: [{ ...state, jobs_today: jobs.filter(j => j.day === state.utc_day).length,
      active_jobs: jobs.filter(j => ['pending','running'].includes(j.status)).length }] };
  } };
  const options = { runMode: 'run', client, resolveMarket: () => market, emit: () => {},
    claim: async (...args) => {
      assert.deepEqual(args, [OWNER, PIN.project, false]); claims++;
      jobs.push({ id: 'job-'+claims, day: state.utc_day, status: 'pending' }); return { jobId: jobs.at(-1).id };
    },
    worker: async (project, type, jobId) => {
      assert.equal(project, PIN.project); assert.equal(type, 'manual'); workers++;
      jobs.find(j => j.id === jobId).status = 'completed';
      return { status: 'completed', errors: [], signalsInserted: 1 };
    } };
  return { options, state, jobs, counts: () => ({ claims, workers, lock }) };
}
test('dry run neither locks, claims, nor executes workers', async () => {
  const h = harness(); assert.equal(await executeDaily({ ...h.options, runMode: 'dry-run' }), 0);
  assert.deepEqual(h.counts(), { claims: 0, workers: 0, lock: false });
});
test('repeat is refused for same UTC day; next day can use a new normal claim', async () => {
  const h = harness(); await executeDaily(h.options);
  await assert.rejects(executeDaily(h.options), /already attempted/);
  h.state.utc_day = '2026-09-17'; await executeDaily(h.options);
  assert.deepEqual(h.counts(), { claims: 2, workers: 2, lock: false });
  assert.equal(h.jobs.length, 2);
});
test('concurrent invocation cannot claim while the first worker holds lock', async () => {
  const h = harness(); let release, entered;
  const gate = new Promise(r => release = r), ready = new Promise(r => entered = r);
  const work = h.options.worker;
  const first = executeDaily({ ...h.options, worker: async (...args) => { entered(); await gate; return work(...args); } });
  await ready;
  await assert.rejects(executeDaily(h.options), /Another daily demo/);
  release(); await first;
  assert.deepEqual(h.counts(), { claims: 1, workers: 1, lock: false });
});
test('crash retains pending journal and blocks even a later day; releases session lock', async () => {
  const h = harness();
  await assert.rejects(executeDaily({ ...h.options, worker: async () => { throw new Error('interrupted'); } }), /interrupted/);
  h.state.utc_day = '2026-09-17'; await assert.rejects(executeDaily(h.options), /Unresolved/);
  assert.equal(h.jobs[0].status, 'pending'); assert.equal(h.counts().lock, false);
});
test('paused preflight and quota refusal never invoke worker', async () => {
  const h = harness(); h.state.project.is_active = false;
  await assert.rejects(executeDaily(h.options), /Active project/); assert.equal(h.counts().claims, 0);
  h.state.project.is_active = true;
  assert.equal(await executeDaily({ ...h.options, claim: async () => new Response('quota', { status: 429 }) }), 2);
  assert.equal(h.counts().workers, 0); assert.equal(h.counts().lock, false);
});
test('partial worker failure consumes the day rather than silently retrying', async () => {
  const h = harness(); const work = h.options.worker;
  assert.equal(await executeDaily({ ...h.options, worker: async (...args) => ({ ...await work(...args), errors: ['timeout'] }) }), 2);
  await assert.rejects(executeDaily(h.options), /already attempted/);
});
