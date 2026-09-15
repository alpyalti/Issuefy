import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { integrationTests } from "./integration-tests.mjs";

const launcher = fileURLToPath(new URL("./test-integration.mjs", import.meta.url));
function fixture(t, body = "require('node:test')('runs', () => {});") {
  const cwd = mkdtempSync(join(tmpdir(), "ify-ci-gate-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  for (const name of ["postgres", "initdb", "pg_ctl"]) {
    writeFileSync(join(bin, name), '#!/bin/sh\necho "postgres (PostgreSQL) 17.0"\n', { mode: 0o755 });
  }
  for (const file of integrationTests) {
    const path = join(cwd, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return { cwd, bin };
}
function run({ cwd, bin }, extraEnv = {}) {
  return spawnSync(process.execPath, [launcher], {
    cwd, encoding: "utf8", env: { PATH: process.env.PATH, ISSUEFY_TEST_PG_BIN: bin, ...extraEnv },
  });
}

test("integration launcher fails without explicit opt-in or required binary", t => {
  const f = fixture(t);
  assert.notEqual(run(f, { ISSUEFY_TEST_PG_BIN: "" }).status, 0);
  rmSync(join(f.bin, "initdb"));
  assert.notEqual(run(f).status, 0);
});

test("integration launcher fails for wrong PG major or missing selected harness", t => {
  const f = fixture(t);
  writeFileSync(join(f.bin, "postgres"), '#!/bin/sh\necho "postgres (PostgreSQL) 16.0"\n');
  assert.notEqual(run(f).status, 0);
  writeFileSync(join(f.bin, "postgres"), '#!/bin/sh\necho "postgres (PostgreSQL) 17.0"\n');
  rmSync(join(f.cwd, integrationTests[0]));
  assert.notEqual(run(f).status, 0);
});

test("mandatory gate rejects skipped, TODO, empty and failed suites", t => {
  for (const body of [
    "require('node:test')('skipped', {skip:true}, () => {});",
    "require('node:test')('later', {todo:true}, () => {});",
    "// no tests",
    "require('node:test')('failure', () => { throw Error('synthetic failure'); });",
  ]) {
    const result = run(fixture(t, body));
    assert.notEqual(result.status, 0, `${body}\n${result.stdout}\n${result.stderr}`);
  }
});

test("mandatory gate runs both files with locale C and removes credential/config variables", t => {
  const f = fixture(t, `const test=require('node:test'),assert=require('node:assert/strict');
    test('sanitized',()=>{
      for(const key of ['DATABASE_URL','PGHOST','PGPASSWORD','STRIPE_SECRET_KEY','HOME','NODE_OPTIONS','ISSUEFY_BILLING_TEST_SOURCE_ROOT']) assert.equal(process.env[key],undefined,key);
      assert.equal(process.env.LC_ALL,'C'); assert.equal(process.env.LANG,'C');
      assert.ok(process.env.ISSUEFY_TEST_PG_BIN);
    });`);
  const result = run(f, {
    DATABASE_URL: "synthetic", PGHOST: "synthetic", PGPASSWORD: "synthetic",
    STRIPE_SECRET_KEY: "synthetic", HOME: "synthetic", NODE_OPTIONS: "--no-warnings",
    ISSUEFY_BILLING_TEST_SOURCE_ROOT: "synthetic", LC_ALL: "invalid",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Integration: 2 tests, 2 passed, 0 failed, 0 skipped/);
});
