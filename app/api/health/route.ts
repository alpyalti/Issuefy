import { requireSql } from "@/lib/db";
import { json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public health endpoint.
 *
 *   GET /api/health  →  { ok, db, durationMs, ts }
 *
 * Fast SELECT 1 against Neon — used by external uptime monitors so we notice
 * a DB outage before customers do. No auth (probes need to hit it without
 * credentials), no PII in the response. Always returns 200 with a status
 * field so monitors can distinguish "endpoint reachable, DB down" from
 * "endpoint unreachable, total outage".
 *
 * Caveats:
 *   - `db: "ok"` only confirms the connection is alive — not that schema is
 *     migrated or that any specific query plan is hot.
 *   - durationMs > 500ms is suspicious (Neon cold-start or network jitter).
 */
export async function GET() {
  const startedAt = Date.now();
  let dbStatus: "ok" | "error" = "error";
  let dbError: string | undefined;
  try {
    const sql = requireSql();
    await sql`SELECT 1`;
    dbStatus = "ok";
  } catch (e) {
    dbError = e instanceof Error ? e.message : "unknown";
  }
  const durationMs = Date.now() - startedAt;
  return json({
    ok: dbStatus === "ok",
    db: dbStatus,
    durationMs,
    ts: new Date().toISOString(),
    ...(dbError ? { error: dbError } : {}),
  });
}
