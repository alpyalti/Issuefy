const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const jsx = require('react/jsx-runtime');

test('real landing billing controls keep displayed cadence and all native signup destinations aligned', () => {
  const Page = loadTs('app/page.tsx', {
    'react/jsx-runtime': jsx, 'next/link': () => null, 'next/image': () => null,
    'next/dynamic': () => () => null, '@/public/portal.png': {}, './landing.css': {},
    '@/components/icons/Icon': { Icon: () => null }, '@/components/landing/LandingChrome': () => null,
  }).default;
  const nodes = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    for (const child of [node.props?.children].flat(Infinity)) visit(child);
  };
  visit(Page());
  const element = node => ({
    attributes: { ...node.props }, dataset: { pricingPlan: node.props['data-pricing-plan'] }, listeners: new Map(),
    classList: { toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, fn) { this.listeners.set(key, fn); },
    removeEventListener(key) { this.listeners.delete(key); },
  });
  const signupNodes = nodes.filter(n => n.props?.['data-pricing-plan']);
  assert.equal(signupNodes.length, 3);
  // DOM href changes must control real navigation, not a Next Link's stale prop.
  for (const node of signupNodes) assert.equal(node.type, 'a');
  const links = signupNodes.map(element);
  const byId = Object.fromEntries(['pricing', 'billMonthly', 'billAnnual'].map(id => [id, element(nodes.find(n => n.props?.id === id))]));
  byId.pricing.querySelectorAll = selector => selector === 'a[data-pricing-plan]' ? links : [];
  let effect;
  const Chrome = loadTs('components/landing/LandingChrome.tsx', {
    react: { useEffect: fn => { effect = fn; }, useLayoutEffect() {} },
    '@/lib/focus-scope': { trapDialogKey() {} },
  }).default;
  Chrome();
  const before = { document: global.document, window: global.window };
  global.document = { getElementById: id => byId[id] ?? null, querySelectorAll: () => [] };
  global.window = { matchMedia: () => ({ matches: false }) };
  let cleanup;
  try {
    cleanup = effect();
    for (const cadence of ['annual', 'monthly', 'annual', 'monthly']) {
      if (cadence === 'monthly') byId.billMonthly.listeners.get('click')();
      else byId.billAnnual.listeners.get('click')();
      assert.equal(byId.pricing.attributes['data-billing'], cadence);
      assert.equal(byId.billMonthly.attributes['aria-pressed'], String(cadence === 'monthly'));
      assert.equal(byId.billAnnual.attributes['aria-pressed'], String(cadence === 'annual'));
      for (const link of links) {
        const destination = new URL(link.attributes.href, 'https://issuefy.test');
        assert.equal(destination.pathname, '/sign-up');
        assert.equal(destination.searchParams.get('plan'), link.dataset.pricingPlan);
        assert.equal(destination.searchParams.get('billing'), cadence);
      }
    }
    cleanup(); cleanup = null;
    assert.equal(byId.billMonthly.listeners.size, 0);
    assert.equal(byId.billAnnual.listeners.size, 0);
  } finally {
    cleanup?.(); global.document = before.document; global.window = before.window;
  }
});
