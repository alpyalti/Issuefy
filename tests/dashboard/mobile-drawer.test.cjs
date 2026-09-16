const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { trapDialogKey } = loadTs('lib/focus-scope.ts');

test('drawer focuses close, contains keyboard navigation, and restores trigger and scroll on dismissal', () => {
  let effect, cleanup, closed = 0;
  const listeners = new Map();
  const doc = { activeElement: null, body: { style: { overflow: 'clip' } } };
  const item = () => ({ getClientRects: () => [{}], focus() { doc.activeElement = this; } });
  const first = item(), close = item(), last = item(), trigger = item();
  const dialog = { ownerDocument: doc, querySelectorAll: () => [first, close, last], contains: el => [first, close, last].includes(el) };
  const refs = [{ current: dialog }, { current: close }];
  const Component = loadTs('components/dashboard/MobileDrawer.tsx', {
    react: { useRef: () => refs.shift(), useEffect: fn => { effect = fn; } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: () => null },
    '@/components/icons/Icon': { Icon: () => null },
    '@/lib/focus-scope': { trapDialogKey },
    './ProfileMenu': { useAccountActions: () => ({ helpHref: '/support', busy: false }) },
  }).default;
  const tree = Component({ open: true, onClose: () => closed++, triggerRef: { current: trigger }, projectId: 'test', projectName: 'Test', userName: 'Test', competitors: [], keywords: [], initials: 'T' });
  assert.equal(tree.props.children.props.role, 'dialog');
  assert.equal(tree.props.children.props['aria-modal'], 'true');
  const before = { document: global.document, window: global.window };
  global.document = doc;
  global.window = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  try {
    cleanup = effect();
    assert.equal(doc.activeElement, close);
    assert.equal(doc.body.style.overflow, 'hidden');
    for (const [active, shiftKey, expected] of [[last, false, first], [first, true, last], [trigger, false, first]]) {
      doc.activeElement = active;
      let prevented = false;
      listeners.get('keydown')({ key: 'Tab', shiftKey, preventDefault() { prevented = true; } });
      assert.equal(doc.activeElement, expected);
      assert.equal(prevented, true);
    }
    listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
    assert.equal(closed, 1);
    cleanup(); cleanup = null;
    assert.equal(doc.activeElement, trigger);
    assert.equal(doc.body.style.overflow, 'clip');
    assert.equal(listeners.size, 0);
  } finally {
    cleanup?.();
    global.document = before.document;
    global.window = before.window;
  }
});
