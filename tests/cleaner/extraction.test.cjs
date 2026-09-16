const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { cleanForStorage, cleanHtml } = loadTs('lib/cleaner.ts');
const fixture = readFileSync(`${__dirname}/fixtures/pricing.html`, 'utf8');
const hash = html => createHash('sha256').update(cleanForStorage(html).snippet).digest('hex');
test('navigation is removed before budget; article dates, table associations and conditions survive', () => {
  const result = cleanForStorage(fixture.replace('Products', 'Menu '.repeat(1500)));
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.text, /Menu|Resources|Solutions|visits/);
  assert.match(result.snippet, /September 14, 2026/);
  assert.match(result.snippet, /Starter \| \$10.99\/user\/month \| Billed annually/);
  assert.match(result.snippet, /Taxes excluded. Offer ends December 31, 2026/);
});
test('navigation counters and formatting leave stored hash unchanged; material edits remain revisions', () => {
  assert.equal(hash(fixture), hash(fixture.replace('123 visits', '456 visits').replace('Solutions', 'Other navigation')));
  assert.equal(hash(fixture), hash(fixture.replace(/></g, '>\n<')));
  for (const [from, to] of [['10.99', '13.49'], ['annually', 'monthly'], ['September 14', 'September 15'], ['100 to 200', '100 to 300']]) {
    assert.notEqual(hash(fixture), hash(fixture.replace(from, to)));
  }
});
test('navigation-only shell fails quality gate and malformed navigation retains evidence', () => {
  assert.equal(cleanForStorage(`<nav>${'link '.repeat(100)}</nav>`).ok, false);
  assert.match(cleanHtml('<nav>Unclosed navigation<article>Release evidence</article>').text, /Release evidence/);
  assert.equal(cleanHtml('<div ROLE=navigation><img src="x">Menu</div><p>Evidence</p>').text, 'Evidence');
});
test('unmarked content, article header/footer and non-navigation roles are preserved', () => {
  assert.equal(cleanHtml('<header>Date</header><div role="table">Useful content</div><footer>Billing conditions</footer>').text, 'Date Useful content Billing conditions');
});
