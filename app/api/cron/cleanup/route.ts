import { checkCronSecret } from "@/lib/cron-auth";
import { requireSql } from "@/lib/db";
import { json } from "@/lib/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retention cleanup cron (PRD §23).
 *
 *   POST /api/cron/cleanup    Authorization: Bearer ${CRON_SECRET}
 *
 * Rules:
 *   - sources: per-plan window (Starter 30d, Growth 90d, Agency 180d). During
 *     beta everyone gets Starter via getLimits(); we still join to users.plan
 *     so the per-plan path is exercised — flipping BETA_STARTER_LIMITS=false
 *     after billing lands needs zero code change here.
 *   - signals: fixed 180 days on all plans.
 *   - daily_summaries: kept until project deletion.
 *
 * Stats counts are returned for visibility (the cron log surfaces them).
 */
// Vercel Cron sends GET. Both methods accepted for local-curl convenience.
async function handle(req: Request) {
  const unauthorized = checkCronSecret(req);
  if (unauthorized) return unauthorized;

  const sql = requireSql();

  const errors: string[] = [];
  let sourcesDeleted = 0;
  let signalsDeleted = 0;

  // ── Sources — plan-aware window. ──────────────────────────────────────
  // Each user's plan determines their cutoff. We compute the cutoff per
  // (user_id, plan) and delete sources scraped before that cutoff in one
  // statement using a CTE for clarity.
  try {
    const result = (await sql`
      WITH cutoffs AS (
        SELECT u.id AS user_id,
               CASE u.plan
                 WHEN 'starter'    THEN now() - interval '30 days'
                 WHEN 'growth'     THEN now() - interval '90 days'
                 WHEN 'agency'     THEN now() - interval '180 days'
                 WHEN 'enterprise' THEN now() - interval '365 days'
                 ELSE now() - interval '30 days'
               END AS cutoff
        FROM users u
      ),
      doomed AS (
        SELECT s.id
        FROM sources s
        JOIN projects p ON p.id = s.project_id
        JOIN cutoffs  c ON c.user_id = p.user_id
        WHERE s.scraped_at < c.cutoff
      )
      DELETE FROM sources WHERE id IN (SELECT id FROM doomed)
      RETURNING id
    `) as { id: string }[];
    sourcesDeleted = result.length;
  } catch (e) {
    captureError(e, { stage: "cleanup.sources" });
    errors.push(`sources: ${e instanceof Error ? e.message : "failed"}`);
  }

  // ── Signals — 180 days everywhere. ────────────────────────────────────
  try {
    const result = (await sql`
      DELETE FROM signals
      WHERE created_at < now() - interval '180 days'
      RETURNING id
    `) as { id: string }[];
    signalsDeleted = result.length;
  } catch (e) {
    captureError(e, { stage: "cleanup.signals" });
    errors.push(`signals: ${e instanceof Error ? e.message : "failed"}`);
  }

  // daily_summaries are kept forever per PRD §23. Cascading FKs already drop
  // signal_sources / daily_summary_sources / scrape_jobs on parent deletion,
  // so no separate cleanup is needed for them.

  return json({ sourcesDeleted, signalsDeleted, errors });
}

export { handle as GET, handle as POST };
