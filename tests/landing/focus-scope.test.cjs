const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { trapDialogKey } = loadTs('lib/focus-scope.ts');
test('modal wraps both Tab directions and recovers focus from outside', () => {
  const doc = { activeElement: null };
  const item = visible => ({ getClientRects: () => visible ? [{}] : [], focus() { doc.activeElement = this; } });
  const first = item(true), last = item(true), hidden = item(false);
  const dialog = { ownerDocument: doc, querySelectorAll: () => [first, last, hidden], contains: el => [first, last].includes(el) };
  for (const [active, shiftKey, expected] of [[last,false,first],[first,true,last],[null,false,first],[null,true,last]]) {
    doc.activeElement = active; let prevented = false;
    trapDialogKey({ key:'Tab', shiftKey, preventDefault: () => prevented = true }, dialog, () => {});
    assert.equal(doc.activeElement, expected); assert.equal(prevented,true);
  }
  let closed = false;
  trapDialogKey({key:'Escape',preventDefault(){}},dialog,()=>closed=true);
  assert.equal(closed,true);
});
