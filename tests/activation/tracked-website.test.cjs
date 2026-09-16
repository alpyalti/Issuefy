const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const safe = loadTs('lib/social-url.ts');
const tracked = loadTs('lib/tracked-website.ts', { '@/lib/social-url': safe });
const payload = loadTs('components/onboarding/payload.ts', { '@/lib/tracked-website': tracked });
const links = loadTs('components/settings/competitor-links.ts', { '@/lib/tracked-website': tracked });
const card = (value, on = true) => ({ name: 'Jira', domain: 'atlassian.com', tagline: 'Projects', socials: [{ kind: 'Website', value, on, icon: 'Globe02Icon' }] });

test('onboarding stores the selected product path, not display domain', () => {
  for (const url of ['https://atlassian.com/software/jira', 'https://atlassian.com/Software/Jira?edition=Cloud&lang=en']) {
    const body = payload.competitorPayload(card(url));
    assert.equal(body.website_url, url);
    assert.equal(body.socials.website, url);
  }
  assert.equal(payload.competitorPayload(card('asana.com')).website_url, 'https://asana.com/');
});
test('edited website wins, enrichment cannot replace original product URL with homepage', () => {
  const socials = payload.seedWebsite([{ kind: 'Website', value: 'https://atlassian.com', on: true }], 'atlassian.com/software/jira?edition=cloud');
  assert.equal(socials.length, 1);
  assert.equal(payload.competitorPayload({ ...card(''), socials }).website_url, 'https://atlassian.com/software/jira?edition=cloud');
  socials[0].value = 'https://example.com/Pricing?tier=Pro#plans';
  assert.equal(payload.competitorPayload({ ...card(''), socials }).website_url, 'https://example.com/Pricing?tier=Pro');
});
test('off, empty, missing and unsafe competitor websites fail instead of tracking display domain', () => {
  for (const value of ['', 'javascript:alert(1)', 'https://user:password@example.com', 'https://example.com:8080/path']) {
    assert.throws(() => payload.competitorPayload(card(value)));
  }
  assert.throws(() => payload.competitorPayload(card('https://example.com', false)));
  assert.throws(() => payload.competitorPayload({ ...card(''), socials: [] }));
});
test('company path survives; disabling company tracking retains profile but disables tracking', () => {
  const body = payload.companyPayload(card('example.com/Product?lang=en', false));
  assert.equal(body.company_website, 'https://example.com/Product?lang=en');
  assert.equal(body.track_company, false);
  assert.equal(body.company_socials.website, undefined);
  const manual = payload.companyPayload({ ...card(''), socials: [] });
  assert.equal(manual.company_website, undefined);
});
test('setup SQL receives authoritative full website URL unchanged', async () => {
  const z = require('zod');
  const actualSchemas = loadTs('lib/schemas/api.ts', { zod: z, '@/lib/markets': loadTs('lib/markets.ts'), '@/lib/social-url': safe });
  const writes = [];
  const setup = loadTs('lib/project-setup.ts', {
    zod: z, '@/lib/schemas/api': actualSchemas, '@/lib/stripe': { stripe: {} }, '@/lib/usage': loadTs('lib/usage.ts'),
    '@/lib/db': { withTx: async (fn) => fn({ query: async (sql, params) => {
      if (sql.startsWith('SELECT plan')) return { rows: [{ plan: 'starter', role: 'user', subscription_status: 'active' }] };
      if (sql.startsWith('SELECT COUNT')) return { rows: [{ n: 0 }] };
      writes.push({ sql, params }); return { rows: [{ id: 'p1' }] };
    } }) },
  });
  const url = 'https://atlassian.com/software/jira?edition=Cloud';
  const body = setup.projectSetupSchema.parse({ name: 'Demo', industry: 'Software', business_type: 'SaaS', target_market: 'GLOBAL', setup: { competitors: [payload.competitorPayload(card(url))], keywords: [] } });
  await setup.createProjectSetup('u1', body);
  const insert = writes.find((w) => w.sql.includes('INSERT INTO competitors'));
  assert.equal(insert.params[2], url);
  assert.equal(JSON.parse(insert.params[5]).website, url);
});
test('settings shows actual tracked target and sends edited website and socials atomically', async () => {
  const draft = links.competitorLinksDraft({ website_url: 'atlassian.com', socials: { website: 'https://atlassian.com/software/jira', linkedin: 'https://linkedin.com/company/atlassian' } });
  assert.equal(draft.website, 'atlassian.com');
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => { request = { url, ...options }; return { ok: true }; };
  try {
    const result = await links.saveCompetitorLinks('c1', { ...draft, website: 'atlassian.com/software/jira?edition=Cloud' });
    assert.equal(request.method, 'PATCH');
    assert.equal(request.url, '/api/competitors/c1');
    assert.deepEqual(JSON.parse(request.body), result);
    assert.equal(result.website_url, 'https://atlassian.com/software/jira?edition=Cloud');
    assert.equal(result.socials.website, result.website_url);
    global.fetch = async () => ({ ok: false });
    await assert.rejects(links.saveCompetitorLinks('c1', draft));
    global.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(links.saveCompetitorLinks('c1', draft));
    global.fetch = async () => assert.fail('blank website must not save');
    await assert.rejects(links.saveCompetitorLinks('c1', { website: '' }));
  } finally { global.fetch = originalFetch; }
});
