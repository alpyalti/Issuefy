const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const z = require('zod');
const usage = loadTs('lib/usage.ts');
function fixture({ failAt, status = 'active', count = 0 } = {}) {
  const writes = [];
  let committed = [];
  const events = [];
  const schemas = { projectCreateSchema: z.z.object({ name: z.z.string() }), competitorCreateSchema: z.z.object({ website_url: z.z.string() }), keywordCreateSchema: z.z.object({ keyword: z.z.string() }) };
  const mod = loadTs('lib/project-setup.ts', { zod: z, '@/lib/usage': usage, '@/lib/stripe': { stripe: {} }, '@/lib/schemas/api': schemas,
    '@/lib/db': { withTx: async (fn) => {
      try {
        const result = await fn({ query: async (sql) => {
          events.push(sql);
          if (sql.startsWith('SELECT plan')) return { rows: [{ plan: 'starter', role: 'user', subscription_status: status }] };
          if (sql.startsWith('SELECT COUNT')) return { rows: [{ n: count }] };
          writes.push(sql);
          if (failAt && sql.includes(failAt)) throw Error('injected database error');
          return { rows: [{ id: 'project1' }] };
        } }); committed = [...writes]; return result;
      } catch (e) { committed = []; throw e; }
    } },
  });
  return { ...mod, events, committed: () => committed };
}
const body = { name: 'Project', industry: 'Tech', business_type: 'SaaS', target_market: 'GLOBAL', setup: { competitors: [{ website_url: 'example.com' }], keywords: [{ keyword: 'growth' }] } };
test('project, owner membership, competitors and keywords share one transaction', async () => {
  const f = fixture();
  assert.equal((await f.createProjectSetup('user1', body)).id, 'project1');
  assert.match(f.events[0], /FOR UPDATE/);
  assert.equal(f.committed().length, 4);
});
test('membership and watchlist failures commit no partial setup, then retry succeeds', async () => {
  for (const failAt of ['project_members', 'competitors', 'keywords']) {
    const f = fixture({ failAt });
    await assert.rejects(f.createProjectSetup('user1', body));
    assert.equal(f.committed().length, 0);
  }
  assert.equal((await fixture().createProjectSetup('user1', body)).id, 'project1');
});
test('subscription and owner project quota rechecked inside lock', async () => {
  for (const options of [{ status: null }, { count: 1 }]) {
    const f = fixture(options);
    await assert.rejects(f.createProjectSetup('user1', body));
    assert.equal(f.committed().length, 0);
  }
});
test('oversize plan watchlist fails before any insert', async () => {
  const f = fixture();
  await assert.rejects(f.createProjectSetup('user1', { ...body, setup: { competitors: Array(4).fill({ website_url: 'example.com' }), keywords: [] } }));
  assert.equal(f.committed().length, 0);
});
