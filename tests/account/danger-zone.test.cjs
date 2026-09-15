const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
function harness(response) {
  const calls = { signOut: 0, refresh: 0, alert: [], pending: [] };
  let index = 0;
  const Component = loadTs('components/account/DangerZone.tsx', {
    react: { useState: () => {
      const n = index++; return [[true, 'synthetic@example.test', false][n], value => { if (n === 2) calls.pending.push(value); }];
    } }, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({ refresh: () => calls.refresh++ }) },
    '@clerk/nextjs': { useClerk: () => ({ signOut: async () => calls.signOut++ }) },
    '@/components/icons/Icon': { Icon: () => null },
  }).default;
  const tree = Component({ email: 'synthetic@example.test' });
  const visit = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && node.props.children === 'Yes, delete my account') return node.props.onClick;
    for (const child of [node.props?.children].flat(Infinity)) { const result = visit(child); if (result) return result; }
    return null;
  };
  return { calls, async click() {
    const fetchBefore = global.fetch; const alertBefore = global.alert;
    global.fetch = async () => response; global.alert = message => calls.alert.push(message);
    try { await visit(tree)(); } finally { global.fetch = fetchBefore; global.alert = alertBefore; }
  } };
}
for (const [status, body] of [[503, { status: 'pending', error: 'Retry deletion' }], [202, { ok: true, status: 'pending' }], [200, { ok: true }]]) {
  test(`DangerZone preserves retry UI instead of signing out on ${status}/${body.status ?? 'ambiguous'}`, async () => {
    const h = harness(new Response(JSON.stringify(body), { status })); await h.click();
    assert.equal(h.calls.signOut, 0); assert.equal(h.calls.refresh, 0); assert.equal(h.calls.alert.length, 1); assert.deepEqual(h.calls.pending, [true, false]);
  });
}
test('DangerZone signs out only on explicit completed deletion', async () => {
  const h = harness(new Response(JSON.stringify({ ok: true, status: 'completed' }))); await h.click();
  assert.equal(h.calls.signOut, 1); assert.equal(h.calls.refresh, 1); assert.equal(h.calls.alert.length, 0);
});
