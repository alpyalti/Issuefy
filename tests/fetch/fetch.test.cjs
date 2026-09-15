const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { resolve } = require("node:path");
const { Script } = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

// Transpile the actual helper without importing any application/provider code.
const filename = resolve(__dirname, "../../lib/fetch.ts");
const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
});
const helper = { exports: {} };
new Script(`(function(exports) { ${outputText}\n})`, { filename })
  .runInThisContext()(helper.exports);
const { fetchWithTimeout } = helper.exports;

async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function slowBody(_req, res) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.write("partial");
  // Intentionally never finish; teardown closes the local connection.
}

test("deadline aborts stalled headers", { timeout: 3000 }, async (t) => {
  const url = await serve(t, () => {});
  await assert.rejects(fetchWithTimeout(url, {}, 100), { name: "AbortError" });
});

test("deadline remains active after quick headers during body consumption", { timeout: 3000 }, async (t) => {
  const url = await serve(t, slowBody);
  const response = await fetchWithTimeout(url, {}, 300);
  assert.equal(response.status, 200);
  await assert.rejects(response.text(), { name: "AbortError" });
});

test("caller cancellation aborts stalled headers and preserves its reason", { timeout: 3000 }, async (t) => {
  const caller = new AbortController();
  const reason = new Error("caller cancelled");
  const url = await serve(t, () => caller.abort(reason));
  await assert.rejects(fetchWithTimeout(url, { signal: caller.signal }, 2000),
    (error) => error === reason);
});

test("caller cancellation still aborts body after headers", { timeout: 3000 }, async (t) => {
  const url = await serve(t, slowBody);
  const caller = new AbortController();
  const response = await fetchWithTimeout(url, { signal: caller.signal }, 2000);
  const body = response.text();
  caller.abort();
  await assert.rejects(body, { name: "AbortError" });
});

test("deadline works with a caller signal that has not aborted", { timeout: 3000 }, async (t) => {
  const url = await serve(t, slowBody);
  const caller = new AbortController();
  const response = await fetchWithTimeout(url, { signal: caller.signal }, 300);
  await assert.rejects(response.text(), { name: "AbortError" });
  assert.equal(caller.signal.aborted, false);
});

test("already cancelled caller rejects immediately", { timeout: 3000 }, async (t) => {
  let requests = 0;
  const url = await serve(t, (_req, res) => { requests++; res.end(); });
  const reason = new Error("already cancelled");
  await assert.rejects(fetchWithTimeout(url, { signal: AbortSignal.abort(reason) }, 2000),
    (error) => error === reason);
  assert.equal(requests, 0);
});

test("normal response preserves request options and native Response behavior", { timeout: 3000 }, async (t) => {
  const url = await serve(t, async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.writeHead(201, { "Content-Type": "application/json", "X-Test": "ok" });
    res.end(JSON.stringify({ method: req.method, header: req.headers["x-input"], body }));
  });
  const response = await fetchWithTimeout(url, {
    method: "POST", headers: { "X-Input": "value" }, body: "payload",
  }, 2000);
  assert.ok(response instanceof Response);
  assert.equal(response.url, url + "/");
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-test"), "ok");
  const clone = response.clone();
  const expected = { method: "POST", header: "value", body: "payload" };
  assert.deepEqual(await response.json(), expected);
  assert.deepEqual(await clone.json(), expected);
  assert.equal(response.bodyUsed, true);
});
