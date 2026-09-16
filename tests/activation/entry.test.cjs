const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const activation = loadTs('lib/activation.ts');
const redirect = (url) => { throw Error(`redirect:${url}`); };
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
test('unpaid onboarding redirects before project queries and preserves selected plan', async () => {
  const page = loadTs('app/onboarding/page.tsx', {
    'react/jsx-runtime': jsx, 'next/navigation': { redirect }, '@/lib/activation': activation,
    '@/lib/billing-gate': { ensureActiveSubscriptionApi: async () => new Response('', { status: 402 }) },
    '@/lib/clerk-user': { getOrCreateUser: async () => ({ id: 'u' }) },
    '@/lib/db': { requireSql: () => { throw Error('must not read setup before billing'); } },
    '@/components/onboarding/OnboardingFlow': () => {}, '../dashboard.css': {},
  }).default;
  await assert.rejects(page({ searchParams: Promise.resolve({ plan: 'agency', billing: 'monthly' }) }), /redirect:\/upgrade\?required=1&plan=agency&billing=monthly/);
});
test('verified onboarding keeps existing owned project and new-mode separate', async () => {
  const page = loadTs('app/onboarding/page.tsx', {
    'react/jsx-runtime': jsx, 'next/navigation': { redirect }, '@/lib/activation': activation,
    '@/lib/billing-gate': { ensureActiveSubscriptionApi: async () => null },
    '@/lib/clerk-user': { getOrCreateUser: async () => ({ id: 'u' }) },
    '@/lib/db': { requireSql: () => async () => [{ id: 'existing' }] },
    '@/components/onboarding/OnboardingFlow': () => {}, '../dashboard.css': {},
  }).default;
  await assert.rejects(page({ searchParams: Promise.resolve({}) }), /redirect:\/dashboard\/existing/);
});
test('spoofed legacy upgraded hint goes to verification without bypassing subscription gate', async () => {
  let gated = false;
  const page = loadTs('app/dashboard/page.tsx', {
    'react/jsx-runtime': jsx, 'next/navigation': { redirect }, 'next/link': () => {}, '@/lib/activation': activation,
    '@/lib/billing-gate': { requireActiveSubscription: async () => { gated = true; }, ensureActiveSubscriptionApi: async () => null },
    '@/lib/clerk-user': { getOrCreateUser: async () => { throw Error('must not upsert a billing return'); } }, '@/lib/db': {},
    '@/components/icons/Icon': {}, '@/components/dashboard/GlobalShell': {}, '../dashboard.css': {},
  }).default;
  await assert.rejects(page({ searchParams: Promise.resolve({ upgraded: '1' }) }), /redirect:\/billing\/complete/);
  assert.equal(gated, false);
});
