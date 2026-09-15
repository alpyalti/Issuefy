const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('../helpers/load-ts.cjs');

function route(requireSql) {
  return loadTs('app/api/health/route.ts', {
    '@/lib/db': { requireSql },
    '@/lib/api': { json: (body, init) => Response.json(body, init) },
  });
}

test('healthy connectivity reports HTTP 200 without caching', async () => {
  let query;
  const { GET } = route(() => async (strings) => { query = strings.join(''); });
  const response = await GET();
  assert.equal(query, 'SELECT 1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.db, 'ok');
});

for (const stage of ['configuration', 'query']) {
  test(`${stage} failure returns 503 without exposing provider errors`, async () => {
    const secret = 'postgres://private-user:secret-password@private-host/database';
    const fail = () => { throw new Error(secret); };
    const { GET } = route(stage === 'configuration' ? fail : () => fail);
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.equal(text.includes(secret), false);
    const body = JSON.parse(text);
    assert.equal(body.ok, false);
    assert.equal(body.db, 'error');
    assert.equal('error' in body, false);
  });
}
