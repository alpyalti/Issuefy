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
  assert.doesNotMatch(result.text, /doctype/i);
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
test('nested same-name navigation and mixed landmarks remove only menu subtrees', () => {
  assert.equal(cleanHtml('<div role="navigation"><div>Outer<div>Inner</div></div><nav>More</nav></div><article><header>Release date</header><p>$20 billed annually</p></article>').text, 'Release date $20 billed annually');
  assert.equal(cleanHtml('<nav><nav>Nested</nav>Tail</nav><article>Release</article>').text, 'Release');
});
test('quoted greater-than and landmark-looking attribute text cannot consume article content', () => {
  assert.equal(cleanHtml(`<div title='example role="navigation" > text'>Pricing $20</div>`).text, 'Pricing $20');
  assert.equal(cleanHtml(`<nav title="x > y"><a title='x </nav> y'>Menu</a></nav><p title="a > b">Billing conditions</p>`).text, 'Billing conditions');
  assert.equal(cleanHtml('<div data-role="navigation">Release evidence</div>').text, 'Release evidence');
});
test('unclosed nested landmarks and incomplete tags preserve following substantive text', () => {
  for (const html of ['<nav><nav>Menu</nav><article>Price $20 annually</article>', '<div role="navigation"><div>Menu</div><article>Price $20 annually</article>', '<nav title="unterminated><article>Price $20 annually</article>']) {
    assert.match(cleanHtml(html).text, /Price \$20 annually/);
  }
});
test('faithful public HTML excerpts retain billing alternatives and dated release heading', () => {
  const excerpt = name => readFileSync(`${__dirname}/fixtures/${name}-excerpt.html`, 'utf8');
  assert.equal(cleanHtml(excerpt('asana-price')).text, '$10.99 Per user, per month billed annually. $13.49 billed monthly');
  assert.equal(cleanHtml(excerpt('atlassian-index')).text, 'Atlassian Cloud changes Sep 7 to Sep 14, 2026');
});
