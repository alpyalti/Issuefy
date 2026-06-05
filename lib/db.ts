import { neon, Pool } from "@neondatabase/serverless";

/**
 * Neon Postgres driver helpers.
 *
 * Two access modes per the architecture plan:
 *
 *   sql      — HTTP `neon()` tagged-template, ideal for single-statement CRUD
 *              from route handlers (~3 round trips vs ~8 for TCP). Module-scoped
 *              and safe to share because each call is one-shot over HTTP.
 *
 *   withTx   — Opens, uses, and CLOSES a websocket Pool inside a single handler
 *              for atomic multi-statement transactions (signals + signal_sources,
 *              daily_summaries + daily_summary_sources, usage counter
 *              reserve-before-call). NEVER hold a Pool at module scope.
 *
 * Callers in Phase 2+ only need `sql` and `withTx`.
 */

// The Neon serverless driver auto-detects Node's built-in fetch on Node 18+.
const DATABASE_URL = process.env.DATABASE_URL;
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

/**
 * Run a function inside a single Postgres transaction over a fresh
 * Pool/Client created and closed per call. The callback receives a Client.
 *
 * Errors trigger ROLLBACK and re-throw. Pool is always closed in finally.
 *
 * Use ONLY when you need multi-statement atomicity. For single SELECT/INSERT,
 * prefer `sql\`...\`` over HTTP — it's faster and has no connection lifecycle.
 */
export async function withTx<T>(fn: (client: import("@neondatabase/serverless").PoolClient) => Promise<T>): Promise<T> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Helper for routes that absolutely require `sql` to be configured. Throws
 *  a clear error at call time rather than warning at module load — that way
 *  the build doesn't spam logs for an env var that's only needed at runtime. */
export function requireSql() {
  if (!sql) throw new Error("DATABASE_URL is not configured. Set it in .env.local.");
  return sql;
}
