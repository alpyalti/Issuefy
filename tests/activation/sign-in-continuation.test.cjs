const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const activation = loadTs('lib/activation.ts');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function find(tree, type) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === type) return tree;
  return [tree.props?.children].flat().map((child) => find(child, type)).find(Boolean);
}
for (const status of ['needs_first_factor', 'needs_second_factor', 'needs_new_password']) {
  test(`pending ${status} hands existing attempt to continuation without activating session`, async () => {
    const routes = [];
    let activated = false;
    const Component = loadTs('components/auth/SignInForm.tsx', {
      react: { useState: (value) => [value, () => {}] }, 'react/jsx-runtime': jsx,
      'next/link': () => {}, 'next/navigation': { useRouter: () => ({ push: (url) => routes.push(url) }), useSearchParams: () => new URLSearchParams('plan=growth&billing=monthly') },
      '@clerk/nextjs/legacy': { useSignIn: () => ({ isLoaded: true, signIn: { create: async () => ({ status }) }, setActive: async () => { activated = true; } }) },
      '@/components/icons/Icon': {}, '@/lib/activation': activation, './SocialProviders': () => {},
    }).default;
    await find(Component(), 'form').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(routes, ['/sign-in/continue?plan=growth&billing=monthly']);
    assert.equal(activated, false);
  });
}
test('continuation route mounts supported Clerk UI and keeps plan selection through hash steps', async () => {
  const SignIn = () => {};
  const page = loadTs('app/sign-in/continue/page.tsx', {
    '@clerk/nextjs': { SignIn }, '@/lib/activation': activation,
    '@/components/auth/AuthShell': () => {}, '../../auth.css': {}, 'react/jsx-runtime': jsx,
  }).default;
  const tree = await page({ searchParams: Promise.resolve({ plan: 'agency', billing: 'annual' }) });
  const component = find(tree, SignIn);
  assert.equal(component.props.routing, 'hash');
  assert.equal(component.props.forceRedirectUrl, '/dashboard?plan=agency&billing=annual');
  assert.equal(component.props.signUpForceRedirectUrl, '/upgrade?required=1&plan=agency&billing=annual');
});
