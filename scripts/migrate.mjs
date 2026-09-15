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
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "pg";
import { loadMigrationEnv, migrationTarget, validateMigrationUrl } from "./migration-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "migrations");
const LOCK_KEY = 8675309; // arbitrary 64-bit-safe integer, project-unique

// Dependency injection lets unit tests exercise this runner without opening a DB.
export async function runMigrations({
  cwd = process.cwd(), env = process.env, ClientClass = Client,
  migrationsDir = MIGRATIONS_DIR, logger = console,
} = {}) {
  let client;
  let acquiredLock = false;
  try {
    await loadMigrationEnv({ cwd, env });
    const connectionString = env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    validateMigrationUrl(connectionString);
    client = new ClientClass({ connectionString });
    logger.log("[migrate] target", JSON.stringify(migrationTarget(client.connectionParameters)));
    await client.connect();

    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    acquiredLock = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    const entries = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: alreadyApplied } = await client.query("SELECT filename FROM _migrations");
    const applied = new Set(alreadyApplied.map((r) => r.filename));

    let pending = 0;
    for (const filename of entries) {
      if (applied.has(filename)) continue;
      pending++;

      const path = resolve(migrationsDir, filename);
      const body = await readFile(path, "utf8");

      logger.log(`[migrate] applying ${JSON.stringify(filename)}`);
      try {
        await client.query("BEGIN");
        await client.query(body);
        await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        logger.log("[migrate] ok");
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch { /* connection may be lost */ }
        throw err;
      }
    }

    if (pending === 0) {
      logger.log("[migrate] no pending migrations");
    } else {
      logger.log(`[migrate] applied ${pending} migration${pending === 1 ? "" : "s"}`);
    }
    return 0;
  } catch {
    // Driver errors can contain SQL, values, credentials or connection details.
    logger.error("[migrate] failed; verify configuration, connectivity and the pending migration. Database error details suppressed.");
    return 1;
  } finally {
    if (acquiredLock) {
      try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch { /* noop */ }
    }
    if (client) await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runMigrations();
}
