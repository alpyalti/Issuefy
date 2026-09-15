const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { serpPublisherUrl } = loadTs('lib/serp-url.ts', { './social-url': loadTs('lib/social-url.ts') });
const { domainOf, normalizeUrl } = loadTs('lib/url-normalize.ts');
const opaqueDemoUrl = 'https://google.com/goto?url=CAESYgHrOzAVMQb81KhCsxLfU3KoBClXnzlzO8fyvsmAc6g2P3-NIlEXzFvvmVxqt90WWCZFIVSiu_2X6X-Wz-0pFC547f4GC1KDjLkrDPUiZSDc0xhUEFhAmtBF66d6eJALuQCn';
const goto = (target) => `https://google.com/goto?url=${encodeURIComponent(target)}`;

test('plain destination goto query shape resolves publisher and preserves article path/query', () => {
  const target = 'https://monday.com/blog/project-management/issue-tracking/?edition=Pro&lang=en';
  const actual = `${goto(target)}&source=web&sa=U`;
  assert.equal(serpPublisherUrl(actual), target);
  assert.equal(domainOf(serpPublisherUrl(actual)), 'monday.com');
  assert.equal(normalizeUrl(serpPublisherUrl(actual)), normalizeUrl(target));
});
test('exact demo opaque goto token remains unresolved with Google identity', () => {
  assert.equal(serpPublisherUrl(opaqueDemoUrl), opaqueDemoUrl);
  assert.equal(domainOf(serpPublisherUrl(opaqueDemoUrl)), 'google.com');
  for (const token of ['CAESshort', 'CAES' + 'a'.repeat(20) + '%3Ahttps%3A%2F%2F127.0.0.1', 'javascript:alert(1)']) {
    assert.equal(serpPublisherUrl(`https://google.com/goto?url=${token}`), null);
  }
});
test('Google url q/url formats decode exactly once, preserving escaped article components', () => {
  const target = 'https://example.org/News/Issue%2FTracking?id=one%26two&part=1&part=2';
  for (const key of ['q', 'url']) {
    assert.equal(serpPublisherUrl(`https://www.google.com/url?${key}=${encodeURIComponent(target)}&sa=t`), target);
  }
  assert.equal(serpPublisherUrl(goto(encodeURIComponent(target))), null);
});
test('unsafe, malformed, nested and ambiguous destinations are dropped', () => {
  for (const target of ['javascript:alert(1)', 'data:text/plain,hello', 'file:///etc/passwd', '//example.org/article',
    'https://localhost/', 'https://metadata.internal/', 'https://127.0.0.1/', 'https://2130706433/',
    'https://0x7f000001/', 'https://169.254.169.254/', 'https://10.0.0.1/', 'https://[::1]/',
    'https://user:secret@example.org/', 'https://example.org:8080/', 'https://example.org/has space',
    'https://example.org/%ZZ', 'https://example.org\\@localhost/', goto('https://example.org/article'),
    'https://www.google.com/url?q=https%3A%2F%2Fexample.org',
    'https://google.com./goto?url=https%3A%2F%2F127.0.0.1', 'https://google.com/%75rl?q=https%3A%2F%2F127.0.0.1']) {
    assert.equal(serpPublisherUrl(goto(target)), null, target);
  }
  for (const raw of ['https://google.com/goto', 'https://google.com/goto?url=',
    `${goto('https://example.org')}&url=https%3A%2F%2Fother.org`,
    'https://google.com/url?url=https%3A%2F%2Fexample.org&q=https%3A%2F%2Fother.org',
    'https://google.com/goto?url=%ZZ']) assert.equal(serpPublisherUrl(raw), null, raw);
});
test('ordinary publisher and lookalike URLs are never unwrapped', () => {
  for (const url of ['https://publisher.org/url?url=https%3A%2F%2Farticle.org',
    'https://google.com.evil.org/goto?url=https%3A%2F%2Farticle.org',
    'https://google.com/search?q=https%3A%2F%2Farticle.org']) assert.equal(serpPublisherUrl(url), url);
});
test('actual SERP extraction returns publisher URLs before ingestion and drops unsafe wrappers', async () => {
  const original = process.env.SCRAPERAPI_KEY;
  process.env.SCRAPERAPI_KEY = 'fixture-not-a-provider-key';
  try {
    const scraper = loadTs('lib/scraperapi.ts', {
      './env': loadTs('lib/env.ts'),
      './serp-url': { serpPublisherUrl },
      './fetch': { fetchWithTimeout: async () => ({ ok: true, json: async () => ({ organic_results: [
        { title: 'Unsafe', link: goto('https://127.0.0.1') },
        { title: 'Issue tracking', link: goto('https://monday.com/blog/issue-tracking?edition=Pro'), snippet: 'A comparison', position: 2 },
        { title: 'Guide', url: 'https://zendesk.com/blog/issue-tracking/' },
        { title: 'Opaque demo', link: opaqueDemoUrl },
      ] }) }) },
    });
    const results = await scraper.serpDiscover({ query: 'issue tracking', topN: 3 });
    assert.equal(results.length, 3);
    assert.deepEqual(results[0], { title: 'Issue tracking', url: 'https://monday.com/blog/issue-tracking?edition=Pro', snippet: 'A comparison', position: 2 });
    assert.equal(domainOf(results[1].url), 'zendesk.com');
    assert.equal(results[2].url, opaqueDemoUrl);
  } finally { if (original === undefined) delete process.env.SCRAPERAPI_KEY; else process.env.SCRAPERAPI_KEY = original; }
});
