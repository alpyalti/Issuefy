const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("../helpers/load-ts.cjs");
const { normalizeUrl, domainOf } = loadTs("lib/url-normalize.ts");

test("source identity merges scheme, hostname, slash and tracking variants", () => {
  const canonical = "https://example.com/news?a=1&b=2";
  for (const input of [canonical, "http://WWW.EXAMPLE.com/news/?b=2&utm_source=email&a=1#summary", "example.com/news?FBCLID=123&b=2&a=1"]) {
    assert.equal(normalizeUrl(input), canonical);
    assert.equal(normalizeUrl(normalizeUrl(input)), canonical);
  }
});

test("meaningful query values and repeated parameters preserve article identity", () => {
  assert.equal(normalizeUrl("example.com/?id=42&id=43&lang=en"), "https://example.com/?id=42&id=43&lang=en");
  assert.notEqual(normalizeUrl("example.com/?id=42"), normalizeUrl("example.com/?id=43"));
});

test("invalid source URLs fail explicitly and domain lookup remains safe", () => {
  assert.throws(() => normalizeUrl(""), /empty/);
  assert.throws(() => normalizeUrl("https://[invalid"), /Invalid URL/);
  assert.equal(domainOf("https://[invalid"), "");
  assert.equal(domainOf("https://WWW.Example.com/news"), "example.com");
});
