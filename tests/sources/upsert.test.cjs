const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { loadTs } = require("../helpers/load-ts.cjs");

async function capture(overrides = {}) {
  let query, values;
  const result = { id: "source-id", url: "https://example.com/page", inserted: false };
  const { upsertSource } = loadTs("lib/sources.ts", {
    "./db": { requireSql: () => async (strings, ...params) => {
      query = strings.join("?").replace(/\s+/g, " ").trim();
      values = params;
      return [result];
    } },
    "./url-normalize": loadTs("lib/url-normalize.ts"),
  });
  assert.equal(await upsertSource({
    projectId: "project-id", title: "Rediscovered title",
    url: "https://example.com/page/", sourceType: "Article",
    contentSnippet: "Discovery snippet", scrapedAt: new Date("2026-09-15T10:00:00Z"),
    ...overrides,
  }), result);
  const assignments = query.split(" DO UPDATE SET ")[1].split(" RETURNING ")[0];
  function assignment(column) {
    return assignments.match(new RegExp(`(?:^|, )${column} = (.*?)(?=, [a-z0-9_]+ = |$)`))?.[1];
  }
  return { query, values, assignment };
}

// SQL contract tests: capture the real helper's query without a database or
// provider connection. These protect the conflict expressions and bindings;
// they do not claim to execute PostgreSQL's ON CONFLICT behavior.
for (const cleanedText of [undefined, null]) {
  test(`metadata-only rediscovery (${cleanedText}) preserves snapshot and timestamps`, async () => {
    const { values, assignment } = await capture({ cleanedText });
    assert.equal(values[9], null);
    assert.equal(values[11], null);
    assert.equal(assignment("cleaned_text"), "COALESCE(EXCLUDED.cleaned_text, sources.cleaned_text)");
    for (const column of ["content_hash", "scraped_at"]) {
      assert.equal(assignment(column), `CASE WHEN EXCLUDED.cleaned_text IS NOT NULL THEN EXCLUDED.${column} ELSE sources.${column} END`);
    }
    assert.equal(assignment("prior_cleaned_text"),
      "CASE WHEN EXCLUDED.cleaned_text IS NOT NULL AND EXCLUDED.content_hash IS DISTINCT FROM sources.content_hash AND sources.content_hash IS NOT NULL AND sources.cleaned_text IS NOT NULL THEN sources.cleaned_text ELSE sources.prior_cleaned_text END");
    assert.equal(assignment("last_changed_at"),
      "CASE WHEN EXCLUDED.cleaned_text IS NOT NULL AND EXCLUDED.content_hash IS DISTINCT FROM sources.content_hash AND sources.content_hash IS NOT NULL THEN now() ELSE sources.last_changed_at END");
  });
}

test("content snapshots retain exact text, hash, and caller scrape timestamp", async () => {
  const text = "Replacement content";
  const { values, assignment } = await capture({ cleanedText: text });
  assert.equal(values[9], text);
  assert.equal(values[11], createHash("sha256").update(text).digest("hex"));
  assert.equal(values[7], "2026-09-15T10:00:00.000Z");
  // Same hashes keep history; legacy null hashes establish a baseline. A real
  // changed snapshot still promotes the previous text and stamps now().
  for (const column of ["prior_cleaned_text", "last_changed_at"]) {
    assert.match(assignment(column), /EXCLUDED.content_hash IS DISTINCT FROM sources.content_hash AND sources.content_hash IS NOT NULL/);
    assert.ok(assignment(column).endsWith(`ELSE sources.${column} END`));
  }
});

test("explicit empty text remains an intentional replacement with a null hash", async () => {
  const { values, assignment } = await capture({ cleanedText: "" });
  assert.equal(values[9], "");
  assert.equal(values[11], null);
  assert.equal(assignment("cleaned_text"), "COALESCE(EXCLUDED.cleaned_text, sources.cleaned_text)");
  assert.equal(assignment("content_hash"),
    "CASE WHEN EXCLUDED.cleaned_text IS NOT NULL THEN EXCLUDED.content_hash ELSE sources.content_hash END");
});

test("discovery continues to refresh metadata and retain optional associations", async () => {
  const { query, values, assignment } = await capture();
  assert.match(query, /ON CONFLICT \(project_id, url\)/);
  assert.equal(values[4], "https://example.com/page");
  assert.equal(values[8], "Discovery snippet");
  for (const column of ["title", "domain", "source_type"]) {
    assert.equal(assignment(column), `EXCLUDED.${column}`);
  }
  assert.equal(assignment("content_snippet"), "CASE WHEN EXCLUDED.cleaned_text IS NOT NULL OR sources.cleaned_text IS NULL THEN EXCLUDED.content_snippet ELSE sources.content_snippet END");
  for (const column of ["r2_raw_html_key", "competitor_id", "keyword_id"]) {
    assert.equal(assignment(column), `COALESCE(EXCLUDED.${column}, sources.${column})`);
  }
});
