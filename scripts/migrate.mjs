#!/usr/bin/env node
/**
 * Plain-SQL migration runner.
 *
 *   npm run migrate
 *
 * - Loads DATABASE_URL from .env.local / .env (via dotenv).
 * - Acquires a Postgres advisory lock so concurrent deploys can't double-apply.
 * - Reads /migrations/*.sql in filename order.
 * - Applies each unrecorded file as a single multi-statement transaction
 *   (pg's Client can run a `.sql` file whole — Neon HTTP can't, which is why
 *   we use node-postgres here).
 * - Records applied files in a `_migrations` table.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { Client } from "pg";

// Load .env.local first if it exists (Next convention), then .env.
async function loadEnv() {
  const { config } = await import("dotenv");
  config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  config({ path: resolve(process.cwd(), ".env"), quiet: true });
}
await loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set. Add it to .env.local and try again.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "migrations");
const LOCK_KEY = 8675309; // arbitrary 64-bit-safe integer, project-unique

const client = new Client({
  connectionString: DATABASE_URL,
  // Neon requires TLS but `?sslmode=require` in the URL handles it; node-pg picks it up.
});

let acquiredLock = false;
try {
  await client.connect();

  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  acquiredLock = true;

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  const entries = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: alreadyApplied } = await client.query("SELECT filename FROM _migrations");
  const applied = new Set(alreadyApplied.map((r) => r.filename));

  let pending = 0;
  for (const filename of entries) {
    if (applied.has(filename)) continue;
    pending++;

    const path = resolve(MIGRATIONS_DIR, filename);
    const body = await readFile(path, "utf8");

    process.stdout.write(`[migrate] applying ${filename}…`);
    try {
      await client.query("BEGIN");
      await client.query(body);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      process.stdout.write(" ok\n");
    } catch (err) {
      await client.query("ROLLBACK");
      process.stdout.write(" FAILED\n");
      console.error(err);
      throw err;
    }
  }

  if (pending === 0) {
    console.log("[migrate] no pending migrations");
  } else {
    console.log(`[migrate] applied ${pending} migration${pending === 1 ? "" : "s"}`);
  }
} catch (err) {
  console.error("[migrate] error:", err.message);
  process.exitCode = 1;
} finally {
  if (acquiredLock) {
    try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch { /* noop */ }
  }
  await client.end().catch(() => {});
}
