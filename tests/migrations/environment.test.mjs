import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMigrationEnv, migrationTarget } from "../../scripts/migration-env.mjs";
import { runMigrations } from "../../scripts/migrate.mjs";

async function fixture(t, files = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "issuefy-migration-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) await writeFile(join(cwd, name), content);
  return cwd;
}

test("local env overrides base, base supplies defaults, shell wins including empty", async (t) => {
  const cwd = await fixture(t, {
    ".env": 'DATABASE_URL=postgres://base.test/base\nBASE_ONLY=base\nSHELL=base\nEMPTY=base\n',
    ".env.local": 'DATABASE_URL="postgres://local.test/local"\nSHELL=local\nEMPTY=local\n',
  });
  const env = { SHELL: "explicit", EMPTY: "" };
  assert.equal(await loadMigrationEnv({ cwd, env }), env);
  assert.deepEqual(env, { SHELL: "explicit", EMPTY: "", DATABASE_URL: "postgres://local.test/local", BASE_ONLY: "base" });
  const shell = { DATABASE_URL: "postgres://shell.test/shell" };
  await loadMigrationEnv({ cwd, env: shell });
  assert.equal(shell.DATABASE_URL, "postgres://shell.test/shell");
});

test("missing local/base files are optional", async (t) => {
  const cwd = await fixture(t);
  assert.deepEqual(await loadMigrationEnv({ cwd, env: {} }), {});
  await writeFile(join(cwd, ".env"), "DATABASE_URL=postgres://base.test/base");
  assert.equal((await loadMigrationEnv({ cwd, env: {} })).DATABASE_URL, "postgres://base.test/base");
});

test("unreadable env fails without partially mutating the environment", async (t) => {
  const cwd = await fixture(t, { ".env": "DATABASE_URL=postgres://base.test/base" });
  await mkdir(join(cwd, ".env.local"));
  const env = { KEEP: "shell" };
  await assert.rejects(loadMigrationEnv({ cwd, env }), /could not be read/);
  assert.deepEqual(env, { KEEP: "shell" });
});

test("target excludes credentials and query parameters; invalid targets fail", () => {
  assert.deepEqual(migrationTarget("postgresql://secret-user:secret-password@db.example.test:6432/app?sslmode=require&token=secret-token"), {
    host: "db.example.test", port: "6432", database: "app",
  });
  for (const url of ["not a url", "https://db.example.test/app", "postgres://db.example.test"]) {
    assert.throws(() => migrationTarget(url));
  }
});

function fakeDatabase({ failBody = false, failConnect = false } = {}) {
  const calls = [];
  class FakeClient {
    constructor(options) { calls.push(["config", options.connectionString]); }
    async connect() { calls.push(["connect"]); if (failConnect) throw new Error("secret-connection-details"); }
    async query(sql, params) {
      calls.push([sql, params]);
      if (sql === "SELECT filename FROM _migrations") return { rows: [{ filename: "0001_done.sql" }] };
      if (failBody && (sql === "SELECT 'pending'" || sql === "ROLLBACK")) throw new Error("secret-sql-and-values");
      return { rows: [] };
    }
    async end() { calls.push(["end"]); }
  }
  const output = [];
  const logger = { log: (...args) => output.push(args.join(" ")), error: (...args) => output.push(args.join(" ")) };
  return { calls, output, logger, ClientClass: FakeClient };
}

test("runner uses selected local target, skips applied files and commits pending files in order", async (t) => {
  const cwd = await fixture(t, {
    ".env": "DATABASE_URL=postgres://base.test/base",
    ".env.local": "DATABASE_URL=postgres://user:secret-password@local.test/local?token=secret-token",
    "0001_done.sql": "DO NOT APPLY",
    "0003_pending.sql": "SELECT 'later'",
    "0002_pending.sql": "SELECT 'pending'",
  });
  const fake = fakeDatabase();
  assert.equal(await runMigrations({ cwd, env: {}, migrationsDir: cwd, ...fake }), 0);
  assert.match(fake.calls[0][1], /@local.test\/local/);
  const queries = fake.calls.map(([sql]) => sql);
  assert(!queries.includes("DO NOT APPLY"));
  assert(queries.indexOf("SELECT 'pending'") < queries.indexOf("SELECT 'later'"));
  assert.equal(queries.filter((q) => q === "COMMIT").length, 2);
  assert.equal(queries.filter((q) => q.startsWith("INSERT INTO")).length, 2);
  assert.deepEqual(queries.slice(-2), ["SELECT pg_advisory_unlock($1)", "end"]);
  assert.doesNotMatch(fake.output.join("\n"), /secret-password|secret-token/);
});

test("failed migration rolls back, does not record completion, unlocks and suppresses raw errors", async (t) => {
  const cwd = await fixture(t, { "0002_pending.sql": "SELECT 'pending'" });
  const fake = fakeDatabase({ failBody: true });
  assert.equal(await runMigrations({ cwd, env: { DATABASE_URL: "postgres://fake.test/test" }, migrationsDir: cwd, ...fake }), 1);
  const queries = fake.calls.map(([sql]) => sql);
  assert(queries.includes("ROLLBACK"));
  assert(!queries.includes("COMMIT"));
  assert(!queries.some((q) => q.startsWith("INSERT INTO")));
  assert.deepEqual(queries.slice(-2), ["SELECT pg_advisory_unlock($1)", "end"]);
  assert.doesNotMatch(fake.output.join("\n"), /secret-sql-and-values/);
});

test("connection failure closes client without unlocking an unacquired lock", async (t) => {
  const cwd = await fixture(t);
  const fake = fakeDatabase({ failConnect: true });
  assert.equal(await runMigrations({ cwd, env: { DATABASE_URL: "postgres://fake.test/test" }, ...fake }), 1);
  assert.deepEqual(fake.calls.map(([sql]) => sql), ["config", "connect", "end"]);
  assert.doesNotMatch(fake.output.join("\n"), /secret-connection-details/);
});

test("explicit empty or invalid shell URL fails before constructing a client", async (t) => {
  const cwd = await fixture(t, { ".env": "DATABASE_URL=postgres://base.test/base" });
  for (const DATABASE_URL of ["", "invalid-secret-value"]) {
    const fake = fakeDatabase();
    assert.equal(await runMigrations({ cwd, env: { DATABASE_URL }, ...fake }), 1);
    assert.deepEqual(fake.calls, []);
    assert.doesNotMatch(fake.output.join("\n"), /invalid-secret-value/);
  }
});
