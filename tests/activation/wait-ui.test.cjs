const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
test('pending checkout reaches bounded timeout, aborts request, and exposes retry state', async () => {
  const original = { setTimeout, clearTimeout, fetch };
  const timers = [];
  const states = [];
  let requestSignal;
  let effect;
  global.setTimeout = (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; };
  global.clearTimeout = () => {};
  global.fetch = async (_url, options) => { requestSignal = options.signal; return { ok: true, status: 200, json: async () => ({ status: 'pending' }) }; };
  try {
    const Component = loadTs('app/billing/complete/CheckoutCompletion.tsx', {
      react: { useState: (v) => [v, (next) => states.push(next)], useEffect: (fn) => { effect = fn; } },
      'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
      'next/link': () => null,
      '@/lib/activation': loadTs('lib/activation.ts'),
    }).default;
    Component({ sessionId: 'cs_test_ok' });
    const cleanup = effect();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.ok(timers.some((t) => t.ms === 2500));
    timers.find((t) => t.ms === 60000).fn();
    assert.equal(requestSignal.aborted, true);
    assert.ok(states.includes(true));
    assert.ok(states.some((s) => typeof s === 'string' && s.includes('don’t start another checkout')));
    cleanup();
  } finally { Object.assign(global, original); }
});
