const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const schemas = loadTs('lib/schemas/ai.ts', { zod: require('zod') });
const grounding = loadTs('lib/signal-grounding.ts');
const now = Date.parse('2026-09-16T12:00:00Z');
const company = { company_name: 'Linear', company_website: 'https://linear.app' };
function candidate(quote = 'Acme launched Team Sync on September 15, 2026.', extra = {}) {
  return { source_id: 's1', title: 'Acme launched Team Sync', category: 'Competitor Move', description: 'Model prose is not assumed to be grounded.', importance: 'Medium', confidence_score: 85,
    suggested_action: 'Evaluate Team Sync against your integration needs.',
    evidence: { kind: 'dated_event', subject: 'Acme', attribute: 'product_launch', quote, event_date: '2026-09-15', date_text: 'September 15, 2026', before_quote: null, before_value: null, after_value: null, action_relation: 'review', action_target: 'Acme', ...extra } };
}
function validate(s, text = s.evidence.quote, more = {}) {
  return grounding.groundSignal(schemas.signalItemSchema.parse(s), { source_id: 's1', text, ...more }, company, now);
}
test('supported current dated event uses exact source description and retains legitimate action', () => {
  const s = candidate(); const result = validate(s);
  assert.equal(result.description, s.evidence.quote);
  assert.equal(result.title, s.title);
  assert.equal(result.suggested_action, s.suggested_action);
});
test('fabricated quote, normalized date, unsupported title and truncated quote reject', () => {
  assert.equal(validate(candidate(), 'Acme has not launched Team Sync.'), null);
  assert.equal(validate(candidate(undefined, { event_date: '2026-09-16' })), null);
  assert.equal(validate({ ...candidate(), title: 'Acme dominates the market' }), null);
  assert.equal(validate(candidate('Acme launched Team Sync on September 15, 2026')), null);
});
test('14-day UTC freshness boundary uses explicit event date, not discovery time', () => {
  for (const [date, expected] of [['2026-09-02', true], ['2026-09-01', false], ['2026-09-17', false]]) {
    const s = candidate(`Acme launched Team Sync on ${date}.`, { event_date: date, date_text: date });
    assert.equal(!!validate(s), expected, date);
  }
  assert.equal(validate(candidate('Acme launched Team Sync on 2026-02-30.', { event_date: '2026-02-30', date_text: '2026-02-30' })), null);
});
test('unambiguous localized dates accepted without English event-verb gates', () => {
  for (const [quote, literal, title] of [
    ['Acme a lancé Team Sync le 15 septembre 2026.', '15 septembre 2026', 'Acme a lancé Team Sync'],
    ['Acmeは2026年9月15日にTeam Syncを発表しました。', '2026年9月15日', 'Acmeは2026年9月15日にTeam Syncを発表しました'],
    ['Acme veröffentlichte Team Sync am 15.09.2026.', '15.09.2026', 'Acme veröffentlichte Team Sync'],
  ]) {
    const s = { ...candidate(quote, { date_text: literal }), title };
    // CJK names are source substrings, not separated by whitespace.
    assert.ok(validate(s), quote);
  }
  assert.equal(validate(candidate('Acme launched Team Sync on 09/15/26.', { date_text: '09/15/26' })), null);
});
test('legitimate scheduled Industry Event retained, not presented as past development', () => {
  const s = { ...candidate('Acme Summit takes place on October 20, 2026.', { kind: 'scheduled_event', attribute: 'industry_event', event_date: '2026-10-20', date_text: 'October 20, 2026' }), title: 'Acme Summit', category: 'Industry Event' };
  assert.ok(validate(s));
  assert.equal(validate({ ...s, category: 'Competitor Move' }), null);
});
test('demo: stale Linear comparison is neither new nor a competitor to itself', () => {
  const s = { ...candidate('Linear ranks among issue-tracking tools as of November 11, 2025.', { subject: 'Linear', event_date: '2025-11-11', date_text: 'November 11, 2025' }), title: 'Linear ranks among issue-tracking tools' };
  assert.equal(validate(s), null);
  const currentSelf = { ...candidate('Linear launched Team Sync on September 15, 2026.', { subject: 'Linear' }), title: 'Linear launched Team Sync' };
  assert.equal(validate(currentSelf), null);
});
test('demo: undated Motion price table cannot manufacture a dated launch', () => {
  const s = candidate('Motion offers AI project management at $12/user/month, billed annually.', { subject: 'Motion' });
  s.title = 'Motion offers AI project management';
  assert.equal(validate(s), null);
});
test('demo: Zendesk page-update date cannot anchor generic advice in another sentence', () => {
  const text = 'Updated September 4, 2026. Zendesk highlights the need for issue tracking.';
  const s = { ...candidate('Zendesk highlights the need for issue tracking.', { subject: 'Zendesk', event_date: '2026-09-04', date_text: 'September 4, 2026' }), title: 'Zendesk highlights the need for issue tracking', category: 'Trend Signal' };
  assert.equal(validate(s, text), null);
});
test('demo: Freshdesk evergreen guidance has no supported event date or prior change', () => {
  const s = { ...candidate('Freshdesk emphasizes issue tracking for customer service.', { subject: 'Freshdesk' }), title: 'Freshdesk emphasizes issue tracking', category: 'Trend Signal' };
  assert.equal(validate(s), null);
});
test('explicit self-competing action omitted without removing unrelated legitimate signal/actions', () => {
  const s = candidate(undefined, { action_relation: 'compete', action_target: 'Linear' });
  s.suggested_action = 'Position against Linear.';
  assert.equal(validate(s).suggested_action, '');
  const normal = candidate(undefined, { action_relation: 'compete', action_target: 'Acme' });
  assert.equal(validate(normal).suggested_action, normal.suggested_action);
});
function priceChange() {
  return candidate('Acme Pro costs $39 per user per month, billed annually.', { kind: 'material_change', attribute: 'pricing', event_date: null, date_text: null,
    before_quote: 'Acme Pro costs $29 per user per month, billed annually.', before_value: '$29', after_value: '$39' });
}
test('observed material price change retains before/after units and billing conditions', () => {
  const s = priceChange();
  const result = validate(s, s.evidence.quote, { text_before: s.evidence.before_quote, changed_since_last_scrape: true });
  assert.match(result.description, /Previously:.*\$29.*billed annually/);
  assert.match(result.description, /Now:.*\$39.*billed annually/);
  assert.match(result.title, /observed change/);
});
test('first discovery, unchanged/copy-only/foreign prior evidence is not a material change', () => {
  const s = priceChange();
  assert.equal(validate(s), null);
  assert.equal(validate(s, s.evidence.quote, { text_before: 'Unrelated prior source.', changed_since_last_scrape: true }), null);
  assert.equal(validate(s, s.evidence.quote + ' ' + s.evidence.before_quote, { text_before: s.evidence.before_quote, changed_since_last_scrape: true }), null);
  const cosmetic = priceChange(); cosmetic.evidence.before_value = 'monthly'; cosmetic.evidence.after_value = 'MONTHLY';
  assert.equal(validate(cosmetic, cosmetic.evidence.quote, { text_before: cosmetic.evidence.before_quote, changed_since_last_scrape: true }), null);
});
test('dated price evidence retains adjacent explicit billing qualifier', () => {
  const quote = 'Acme reduced Pro to $12 per user per month on September 15, 2026.';
  const s = { ...candidate(quote, { attribute: 'pricing' }), title: 'Acme reduced Pro' };
  assert.equal(validate(s, quote + ' Billed annually. More details follow.').description, quote + ' Billed annually.');
});
test('missing structured evidence fails schema validation', () => {
  const s = candidate(); delete s.evidence;
  assert.equal(schemas.signalItemSchema.safeParse(s).success, false);
});

module.exports = { candidate, priceChange, now, schemas, grounding };

test('actual decorated demo company without website still identifies Linear as self', () => {
  const demo = { company_name: 'Linear — Issuefy Demo', company_website: null };
  const self = { ...candidate('Linear launched Team Sync on September 15, 2026.', { subject: 'Linear' }), title: 'Linear launched Team Sync' };
  assert.equal(grounding.groundSignal(self, { source_id: 's1', text: self.evidence.quote }, demo, now), null);
  const other = candidate(undefined, { action_relation: 'compete', action_target: 'Linear' });
  other.suggested_action = 'Position against Linear.';
  assert.equal(grounding.groundSignal(other, { source_id: 's1', text: other.evidence.quote }, demo, now).suggested_action, '');
});
