const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const schemas = loadTs('lib/schemas/ai.ts', { zod: require('zod') });
const grounding = loadTs('lib/signal-grounding.ts');
const now = Date.parse('2026-09-16T12:00:00Z');
const quote = 'Acme launched Team Sync on September 15, 2026.';
function signal() {
  return { source_id: 's1', title: 'Acme launched Team Sync', category: 'Competitor Move', description: 'Unsupported generated claim.', importance: 'Medium', confidence_score: 80, suggested_action: 'Review the offering.', evidence: {
    kind: 'dated_event', subject: 'Acme', attribute: 'product_launch', quote, event_date: '2026-09-15', date_text: 'September 15, 2026', before_quote: null, before_value: null, after_value: null, action_relation: 'review', action_target: 'Acme',
  } };
}
async function run(signals, source = {}) {
  let prompt;
  const inserts = [];
  const sql = async (parts) => {
    const query = parts.join('');
    if (query.includes('FROM projects')) return [{ id: 'p1', user_id: 'u1', name: 'Demo', company_name: 'Linear', company_website: 'https://linear.app', target_market: 'GLOBAL' }];
    if (query.includes('FROM users')) return [{ plan: 'starter' }];
    if (query.includes('FROM sources')) return [{ id: 's1', title: 'Announcement', url: 'https://acme.org/news', cleaned_text: quote + ' ' + 'Context. '.repeat(30), prior_cleaned_text: null, last_changed_at: null, ...source }];
    if (query.includes('COUNT(*)')) return [{ n: 0 }];
    return [];
  };
  const module = loadTs('lib/signals.ts', {
    './signal-grounding': grounding, './schemas/ai': schemas,
    './db': { requireSql: () => sql, withTx: async (fn) => fn({ query: async (q, args) => { if (q.includes('INSERT INTO signals')) inserts.push(args); return { rows: [{ id: 'sig1' }] }; } }) },
    './openrouter': { chatJson: async (opts) => { prompt = opts; return { data: schemas.signalExtractionResponseSchema.parse({ signals }), modelUsed: 'mock' }; } },
    './usage-counters': { reserveCalls: async () => 0 }, './usage': { getLimits: () => ({ maxSignalsPerProjectPerDay: 20 }) },
    './sentry': { captureError: () => {} }, './markets': { resolveMarket: () => ({ canonicalName: 'Global' }) }, './company-block': { companyPromptBlock: () => 'Your company: Linear' },
  });
  const old = Date.now; Date.now = () => now;
  try { return { result: await module.generateSignalsForProject('p1'), inserts, prompt }; } finally { Date.now = old; }
}
test('actual extraction filters evidence before writes and stores grounded text rather than model prose', async () => {
  const invalid = { ...signal(), source_id: 'unknown' };
  const { result, inserts, prompt } = await run([signal(), invalid]);
  assert.equal(result.inserted, 1); assert.equal(result.rejected, 1);
  assert.equal(inserts[0][3], quote);
  assert.equal(inserts[0][6], 'Review the offering.');
  assert.ok(prompt.jsonSchema.properties.signals.items.required.includes('evidence'));
  assert.match(prompt.messages[0].content, /2026-09-16/);
});
test('evidence outside the exact supplied 6000-character snapshot cannot authorize writes', async () => {
  const { result, inserts } = await run([signal()], { cleaned_text: 'Other text. '.repeat(600) + quote });
  assert.equal(result.inserted, 0); assert.equal(result.rejected, 1); assert.equal(inserts.length, 0);
});
test('actual extraction only supplies fresh non-future before snapshots', async () => {
  const s = signal();
  Object.assign(s.evidence, { kind: 'material_change', attribute: 'pricing', quote: 'Acme Pro costs $39 per month.', before_quote: 'Acme Pro costs $29 per month.', before_value: '$29', after_value: '$39', event_date: null, date_text: null });
  for (const [offset, accepted] of [[-3600000, 1], [-3600001, 0], [1, 0]]) {
    const { result } = await run([s], { cleaned_text: s.evidence.quote + ' Context. '.repeat(30), prior_cleaned_text: s.evidence.before_quote, last_changed_at: new Date(now + offset).toISOString() });
    assert.equal(result.inserted, accepted, String(offset));
  }
});
