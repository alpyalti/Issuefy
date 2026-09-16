const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute production TypeScript with isolated dependencies; no DB or provider calls.
function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`);
    return mocks[name];
  }, Response, URL, Date, Map, Set, console, process: { env: { BETA_STARTER_LIMITS: "false" } } }, { filename: file });
  return exports;
}
function setup({ status = 'active', ownerPlan = 'starter', callerPlan = 'agency', callerRole = 'editor', callerStatus = null, body = {}, ownerRole = 'user', admin = false, stripe = true, active = true, missing = false, count = 0 } = {}) {
  const queries = [];
  const caller = { id: 'caller', plan: callerPlan, email: 'caller@example.test' };
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); queries.push({ query, values });
    if (query.includes('AS "ownerId"')) return missing ? [] : [{ ownerId: 'target-owner', plan: ownerPlan, subscription_status: status, role: ownerRole, isActive: active }];
    if (query.includes('subscription_status, role FROM users')) return [{ subscription_status: callerStatus, role: admin ? 'admin' : 'user' }];
    if (query.includes('SELECT p.*, pm.role')) return ['owner', 'editor'].includes(callerRole) ? [{ id: 'project', current_user_role: callerRole, last_manual_refresh_at: null }] : [];
    if (query.includes('SELECT u.id, u.plan')) return [{ id: 'target-owner', plan: ownerPlan }];
    if (query.includes('SELECT p.last_manual_refresh_at')) return [{ cooling_down: false }];
    if (query.includes('COUNT(*)')) return [{ n: count }];
    if (query.includes('INSERT')) return [{ id: 'created' }];
    if (query.includes('UPDATE projects')) return [];
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const billing = load('lib/billing-gate.ts', {
    react: { cache: f => f }, 'next/navigation': { redirect() { throw new Error('redirect'); } },
    '@/lib/db': { requireSql: () => sql }, '@/lib/stripe': { stripe: stripe ? {} : null },
  });
  const api = load('lib/api.ts', { zod: {}, './db': { sql } });
  let ran = false;
  const claims = load('lib/entitlement-claims.ts', {
    './db': { withTx: async fn => fn({ query: async (query, values = []) => ({ rows: await sql([query], ...values) }) }) },
    './usage': load('lib/usage.ts', {}), './api': api,
  });
  const mocks = {
    'next/server': { after: fn => { void fn(); } },
    '@/lib/scrape-jobs': { runQueuedJob: async (id, type, job, worker) => worker(id, type, job) },
    '@/lib/entitlement-claims': claims,
    '@/lib/clerk-user': { requireUser: async () => caller }, '@/lib/billing-gate': billing,
    '@/lib/db': { requireSql: () => sql }, '@/lib/api': { ...api, parseJson: async () => ({ keyword: 'test', website_url: 'https://example.test', ...body }) },
    '@/lib/usage': load('lib/usage.ts', { './db': { requireSql: () => sql } }),
    '@/lib/schemas/api': {}, '@/lib/admin': { isAdmin: async () => admin },
    '@/lib/process-project': { processProject: async () => { ran = true; return {}; } },
    '@/lib/sentry': { captureError() {} },
  };
  return { billing, queries, ran: () => ran, route: kind => load(`app/api/projects/[id]/${kind ? kind + '/' : ''}route.ts`, mocks) };
}

const allowed = ['trialing', 'active', 'past_due', 'paused'];
for (const status of [...allowed, 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', null]) {
  for (const role of ['owner', 'editor', 'viewer']) {
    for (const ownerPlan of ['starter', 'growth', 'agency', 'enterprise']) {
      test(`${role}, ${ownerPlan}, ${status}: target owner decides API and worker access`, async () => {
        const s = setup({ status, callerRole: role, ownerPlan });
        const response = await s.route('keywords').POST(new Request('https://test'), { params: Promise.resolve({ id: 'project' }) });
        assert.equal(response.status, role === 'viewer' ? 404 : allowed.includes(status) ? 201 : 402);
        if (allowed.includes(status)) await s.billing.ensureProjectWorkerSubscription('project');
        else await assert.rejects(s.billing.ensureProjectWorkerSubscription('project'), /owner subscription/);
      });
    }
  }
}

test('subscribed membership cannot grant personal operations', async () => {
  const s = setup();
  assert.equal((await s.billing.ensureActiveSubscriptionApi('caller')).status, 402);
  assert.ok(s.queries.every(q => !q.query.includes('project_members')));
});

for (const kind of ['keywords', 'competitors']) {
  for (const [ownerPlan, callerPlan] of [['starter', 'agency'], ['agency', 'starter']]) {
    test(`${kind}: ${callerPlan} caller uses ${ownerPlan} owner cap`, async () => {
      const s = setup({ ownerPlan, callerPlan, count: kind === 'keywords' ? 10 : 3 });
      const response = await s.route(kind).POST(new Request('https://test'), { params: Promise.resolve({ id: 'project' }) });
      assert.equal(response.status, ownerPlan === 'starter' ? 409 : 201);
    });
  }
}

test('manual refresh uses owner plan and owner usage account', async () => {
  const s = setup({ ownerPlan: 'agency', callerPlan: 'starter', count: 2 });
  const response = await s.route('refresh').POST(new Request('https://test'), { params: Promise.resolve({ id: 'project' }) });
  assert.equal(response.status, 202);
  assert.ok(s.ran());
  const quota = s.queries.find(q => q.query.includes('FROM scrape_jobs'));
  assert.equal(quota.values[0], 'target-owner');
});

test('Agency editor cannot exceed Starter owner refresh cap', async () => {
  const s = setup({ count: 2 });
  const response = await s.route('refresh').POST(new Request('https://test'), { params: Promise.resolve({ id: 'project' }) });
  assert.equal(response.status, 429);
  assert.equal(s.ran(), false);
});

test('admin and Stripe-unconfigured bypass remain; missing/inactive workers fail closed', async () => {
  for (const options of [{ admin: true }, { stripe: false }, { ownerRole: 'admin' }]) {
    const s = setup({ status: 'canceled', ...options });
    assert.equal((await s.billing.ensureProjectSubscriptionApi('caller', 'project')).ownerId, 'target-owner');
    if (!options.admin) await s.billing.ensureProjectWorkerSubscription('project');
    else await assert.rejects(s.billing.ensureProjectWorkerSubscription('project'));
  }
  for (const options of [{ active: false }, { missing: true }]) {
    await assert.rejects(setup({ stripe: false, ...options }).billing.ensureProjectWorkerSubscription('project'));
  }
});

for (const [file, entry, args] of [
  ['process-project', 'processProject', ['project', 'cron']],
  ['social-profile', 'refreshSocialProfiles', ['project']],
  ['leads', 'discoverLeadsForProject', ['project']],
  ['leads', 'reclassifyExistingLeads', ['project']],
  ['leads', 'draftLeadReply', ['lead', 'project']],
]) {
  test(`${entry} rechecks billing before any provider call or write`, async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../lib', `${file}.ts`), 'utf8');
    const mocks = {};
    for (const [, name] of source.matchAll(/from ["']([^"']+)["']/g)) {
      mocks[name] = new Proxy({}, { get: (_, key) => () => { throw new Error(`Unexpected dependency call: ${name}.${String(key)}`); } });
    }
    mocks.zod = require('zod');
    let checked = false;
    mocks['@/lib/billing-gate'] = { ensureProjectWorkerSubscription: async id => {
      assert.equal(id, 'project'); checked = true; throw new Error('denied owner');
    } };
    mocks['@/lib/billing-gate'].ensureProjectOwnerSubscription = mocks['@/lib/billing-gate'].ensureProjectWorkerSubscription;
    mocks['@/lib/db'] = { requireSql: () => async strings => {
      assert.match(strings.join(''), /SELECT/);
      return [{ id: 'project', user_id: 'target-owner', is_active: true }];
    } };
    mocks['./db'] = mocks['@/lib/db'];
    const worker = load(`lib/${file}.ts`, mocks);
    await assert.rejects(worker[entry](...args), /denied owner/);
    assert.equal(checked, true);
  });
}

for (const callerStatus of ['active', null]) {
  test(`caller status ${callerStatus} cannot entitle canceled target owner`, async () => {
    const s = setup({ status: 'canceled', callerStatus });
    assert.equal((await s.billing.ensureProjectSubscriptionApi('caller', 'project')).status, 402);
  });
}
for (const status of ['active', 'canceled']) {
  test(`reactivation requires target owner entitlement: ${status}`, async () => {
    const s = setup({ status, body: { is_active: true } });
    const response = await s.route('').PATCH(new Request('https://test'), { params: Promise.resolve({ id: 'project' }) });
    assert.equal(response.status, status === 'active' ? 200 : 402);
    assert.equal(s.queries.some(q => q.query.includes('UPDATE projects')), status === 'active');
  });
}
test('lapsed owner can still pause a project', async () => {
  const s = setup({ status: 'canceled', body: { is_active: false } });
  const response = await s.route('').PATCH(new Request('https://test'), { params: Promise.resolve({ id: 'project' }) });
  assert.equal(response.status, 200);
});

// Composed regression: real route -> real draft -> real billing guards.
// Only identity, SQL, and external provider boundaries are mocked.
function pausedLeadFlow(status, role = 'owner', missing = false) {
  let providerCalls = 0;
  let writes = 0;
  let billingReads = 0;
  const project = { id: 'project', user_id: 'target-owner', is_active: false,
    company_name: 'Example', company_description: 'A useful product', track_company: true,
    industry: 'software', business_type: 'B2B', target_market: null };
  const lead = { id: 'lead', keyword_id: 'keyword', keyword: 'test', platform: 'reddit',
    context: 'r/test', post_title: 'Looking for a tool', post_excerpt: 'Please recommend one', author: 'poster', ...project };
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('AS "ownerId"')) {
      billingReads++;
      assert.equal(values[0], 'project');
      return missing ? [] : [{ ownerId: 'target-owner', plan: 'agency', role: 'user', subscription_status: status, isActive: false }];
    }
    if (query.includes('subscription_status, role FROM users')) return [{ role: 'user', subscription_status: 'active' }];
    if (query.includes('SELECT p.*, pm.role')) return role === 'viewer' ? [] : [{ ...project, current_user_role: role }];
    if (query.includes('SELECT id FROM keyword_leads')) return [{ id: 'lead' }];
    if (query.includes('SELECT p.id, p.user_id')) return [project];
    if (query.includes('SELECT kl.id')) return [lead];
    if (query.includes('UPDATE keyword_leads')) { writes++; return []; }
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const billing = load('lib/billing-gate.ts', {
    react: { cache: f => f }, 'next/navigation': {}, '@/lib/stripe': { stripe: {} }, '@/lib/db': { requireSql: () => sql },
  });
  const leads = load('lib/leads.ts', {
    '@/lib/billing-gate': billing, zod: require('zod'), './db': { requireSql: () => sql },
    './openrouter': { chatJson: async () => { providerCalls++; return {
      data: { reply_text: 'Draft recommendation', leads: [{ ref: 0, is_lead: true, score: 90, intent: 'researching', reason: 'Good fit' }] }, modelUsed: 'mock',
    }; } },
    './usage-counters': {}, './usage': {}, './markets': { resolveMarket: () => ({ canonicalName: 'Global' }) },
    './lead-sources': {}, './apify': {}, './sentry': {},
  });
  const route = load('app/api/projects/[id]/leads/[leadId]/draft-reply/route.ts', {
    '@/lib/clerk-user': { requireUser: async () => ({ id: 'caller' }) },
    '@/lib/billing-gate': billing, '@/lib/db': { requireSql: () => sql },
    '@/lib/api': load('lib/api.ts', { zod: require('zod'), './db': { sql } }),
    '@/lib/leads': leads, '@/lib/sentry': { captureError() {} },
  });
  return { leads, billing, run: () => route.POST(new Request('https://test'), { params: Promise.resolve({ id: 'project', leadId: 'lead' }) }),
    counts: () => ({ providerCalls, writes, billingReads }) };
}

for (const role of ['owner', 'editor', 'viewer']) {
  for (const status of ['active', 'canceled']) {
    test(`paused project draft composed flow: ${role}, ${status}`, async () => {
      const s = pausedLeadFlow(status, role);
      const response = await s.run();
      const permitted = role !== 'viewer' && status === 'active';
      assert.equal(response.status, role === 'viewer' ? 404 : permitted ? 200 : 402);
      if (permitted) assert.equal((await response.json()).reply, 'Draft recommendation');
      assert.equal(s.counts().providerCalls, permitted ? 1 : 0);
      assert.equal(s.counts().writes, permitted ? 1 : 0);
      if (permitted) assert.equal(s.counts().billingReads, 2);
    });
  }
}
for (const status of ['active', 'canceled']) {
  test(`paused project reclassification keeps owner billing check: ${status}`, async () => {
    const s = pausedLeadFlow(status);
    if (status === 'active') {
      const result = await s.leads.reclassifyExistingLeads('project');
      assert.equal(result.kept, 1);
    } else await assert.rejects(s.leads.reclassifyExistingLeads('project'), /owner subscription/);
    assert.equal(s.counts().providerCalls, status === 'active' ? 1 : 0);
    assert.equal(s.counts().writes, status === 'active' ? 1 : 0);
  });
}
test('paused scan still rejected; direct existing-data draft fails closed for missing or lapsed owner', async () => {
  await assert.rejects(pausedLeadFlow('active').billing.ensureProjectWorkerSubscription('project'), /inactive/);
  for (const [status, missing] of [['canceled', false], ['active', true]]) {
    const s = pausedLeadFlow(status, 'owner', missing);
    await assert.rejects(s.leads.draftLeadReply('lead', 'project'), /owner subscription/);
    assert.equal(s.counts().providerCalls, 0);
    assert.equal(s.counts().writes, 0);
  }
});
