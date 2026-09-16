import { requireSql, withSession } from "./db";
import { captureError } from "./sentry";

export class JobEntryError extends Error {}

export class ProjectBusyError extends Error {
  constructor() { super("Another scan is running for this project; queued work has been retained"); }
}

/** An open transaction pins the backend even behind a transaction pooler.
 * It holds only an advisory lease; application writes commit separately. */
export async function withScrapeLease<T>(projectId: string, run: (checkpoint: () => Promise<void>) => Promise<T>): Promise<T> {
  return withSession(async client => {
    let lost = false;
    const onError = () => { lost = true; };
    client.on("error", onError);
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '290s'");
      const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired", [`issuefy-scrape:${projectId}`]);
      if (!lock.rows[0]?.acquired) throw new ProjectBusyError();
      const checkpoint = async () => {
        if (lost) throw new Error("Project scan lease lost; provider outcome may be uncertain");
        await client.query("SELECT 1");
      };
      // Ten minutes exceeds the hosted worker's 300s duration. Do not replay
      // interrupted paid work. A still-live session would have refused the lock.
      const sql = requireSql();
      await sql`UPDATE scrape_jobs SET status='failed', finished_at=now(),
        error_message='Worker interrupted; provider outcome uncertain. No automatic replay.'
        WHERE project_id=${projectId} AND status='running' AND started_at < now()-interval '10 minutes'`;
      const active = await client.query("SELECT id FROM scrape_jobs WHERE project_id=$1 AND status='running' LIMIT 1", [projectId]);
      if (active.rows.length) throw new ProjectBusyError();
      return await run(checkpoint);
    } finally {
      try { await client.query("ROLLBACK"); } catch { /* disconnected backend releases its lock */ }
      client.removeListener("error", onError);
      // withSession also destroys the connection; no lease returns to a pool.
    }
  });
}

/** A single statement durably enqueues every eligible project before any fetch. */
export async function enqueueDailyJobs() {
  const sql = requireSql();
  await sql`INSERT INTO scrape_jobs(project_id,status,job_type,daily_key)
    SELECT p.id,'pending','daily',(now() AT TIME ZONE 'UTC')::date FROM projects p
    WHERE p.is_active=true AND (
      EXISTS(SELECT 1 FROM competitors c WHERE c.project_id=p.id AND c.is_active=true)
      OR (SELECT count(*) FROM keywords k WHERE k.project_id=p.id AND k.is_active=true)>=3)
    ON CONFLICT (project_id,daily_key) WHERE daily_key IS NOT NULL DO NOTHING`;
  // Old never-started daily work is superseded, not run back-to-back with today.
  await sql`UPDATE scrape_jobs SET status='failed',finished_at=now(),
    error_message='Queued daily scan expired before starting; superseded by current daily scan'
    WHERE status='pending' AND job_type='daily' AND daily_key < (now() AT TIME ZONE 'UTC')::date`;
  return await sql`SELECT id,project_id,job_type FROM scrape_jobs WHERE status='pending' ORDER BY created_at,id` as Array<{ id: string; project_id: string; job_type: "daily" | "manual" }>;
}

export async function recordDispatchFailure(jobId: string, message: string) {
  const sql = requireSql();
  await sql`UPDATE scrape_jobs SET dispatch_error=${message} WHERE id=${jobId} AND status='pending'`;
}

/** Fail entry checks visibly, but never turn a duplicate/busy delivery into failure. */
export async function runQueuedJob(projectId: string, jobType: "daily" | "manual", jobId: string,
  worker: (projectId: string, jobType: "daily" | "manual", jobId: string) => Promise<unknown>) {
  try { await worker(projectId, jobType, jobId); }
  catch (error) {
    if (error instanceof ProjectBusyError) return;
    captureError(error, { stage: "queued-worker", projectId, jobId });
    if (!(error instanceof JobEntryError)) {
      await recordDispatchFailure(jobId, "Worker did not start; pending delivery can be retried");
      return;
    }
    const sql = requireSql();
    await sql`UPDATE scrape_jobs SET status='failed',finished_at=now(),error_message='Worker could not start; check project eligibility and configuration'
      WHERE id=${jobId} AND project_id=${projectId} AND status='pending'`;
  }
}
