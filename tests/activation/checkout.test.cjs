const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
function fixture({ local = {}, session = {}, configured = true } = {}) {
  const account = { stripe_customer_id: 'cus_mine', stripe_subscription_id: null, subscription_status: null, plan: 'starter', role: 'user', ...local };
  const sub = { id: 'sub_new', livemode: true, status: 'trialing', items: { data: [{ price: { id: 'price_growth', recurring: { interval: 'year' } } }] } };
  const checkout = { id: 'cs_live_ok', livemode: true, mode: 'subscription', customer: 'cus_mine', metadata: { app_user_id: 'user1' }, status: 'complete', payment_status: 'no_payment_required', subscription: sub, ...session };
  const module = loadTs('lib/checkout-completion.ts', {
    '@/lib/billing-mode': { expectedBillingLivemode: () => true },
    '@/lib/db': { requireSql: () => async () => [account] },
    '@/lib/stripe': { stripe: configured ? { checkout: { sessions: { retrieve: async () => checkout } } } : null, planFromPriceId: (id) => id === 'price_growth' ? 'growth' : null },
  });
  return { ...module, account };
}
test('completed checkout waits until webhook commits matching subscription and plan', async () => {
  const f = fixture();
  assert.equal((await f.checkoutCompletion('user1', 'cs_live_ok')).status, 'pending');
  Object.assign(f.account, { stripe_subscription_id: 'sub_new', subscription_status: 'trialing', plan: 'growth' });
  assert.deepEqual(await f.checkoutCompletion('user1', 'cs_live_ok'), { status: 'ready', plan: 'growth', billing: 'annual' });
});
test('spoofed, foreign customer and foreign metadata sessions cannot authorize', async () => {
  for (const session of [{ customer: 'cus_other' }, { metadata: { app_user_id: 'other' } }, { mode: 'payment' }]) {
    await assert.rejects(fixture({ session }).checkoutCompletion('user1', 'cs_live_ok'));
  }
  await assert.rejects(fixture().checkoutCompletion('user1', 'upgraded=1'));
});
test('unrelated subscribed account and unfinished checkout stay pending', async () => {
  assert.equal((await fixture({ local: { stripe_subscription_id: 'sub_old', subscription_status: 'active', plan: 'growth' } }).checkoutCompletion('user1', 'cs_live_ok')).status, 'pending');
  assert.equal((await fixture({ session: { status: 'open' } }).checkoutCompletion('user1', 'cs_live_ok')).status, 'pending');
  assert.equal((await fixture().checkoutCompletion('user1')).status, 'pending');
});
test('admin uses valid mode while unconfigured completion fails closed', async () => {
  await assert.rejects(fixture({ configured: false }).checkoutCompletion('user1'));
  assert.equal((await fixture({ local: { role: 'admin' } }).checkoutCompletion('user1')).status, 'ready');
});
test('navigation preserves only validated plan and billing', () => {
  const { activationUrl } = loadTs('lib/activation.ts');
  assert.equal(activationUrl('growth', 'annual'), '/upgrade?required=1&plan=growth&billing=annual');
  assert.equal(activationUrl('javascript:x', 'no'), '/upgrade?required=1');
});
