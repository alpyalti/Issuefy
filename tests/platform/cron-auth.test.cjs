const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("../helpers/load-ts.cjs");
const { checkCronSecret, checkInternalSecret } = loadTs("lib/cron-auth.ts", { "./env": loadTs("lib/env.ts") });

for (const [key, guard] of [
  ["CRON_SECRET", checkCronSecret],
  ["INTERNAL_WORKER_SECRET", checkInternalSecret],
]) {
  test(`${key}: fails closed without configuration`, () => {
    delete process.env[key];
    assert.equal(guard(new Request("https://example.test")).status, 503);
  });

  test(`${key}: rejects missing, malformed, wrong and multibyte credentials`, (t) => {
    process.env[key] = "synthetic-test-secret";
    t.after(() => delete process.env[key]);
    for (const authorization of ["", "Basic synthetic-test-secret", "Bearer wrong", "Bearer synthetic-test-secrex", "Bearer é"]) {
      assert.equal(guard(new Request("https://example.test", { headers: { authorization } })).status, 401);
    }
  });

  test(`${key}: accepts the configured bearer token`, (t) => {
    process.env[key] = "synthetic-test-secret";
    t.after(() => delete process.env[key]);
    assert.equal(guard(new Request("https://example.test", {
      headers: { authorization: "bEaReR synthetic-test-secret" },
    })), null);
  });
}
