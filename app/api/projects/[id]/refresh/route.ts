import { after } from "next/server";
import { requireUser } from "@/lib/clerk-user";
import { ensureProjectSubscriptionApi } from "@/lib/billing-gate";
import { isAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, manageableProject, ownedProject, notFound } from "@/lib/api";
import { claimManualRefresh } from "@/lib/entitlement-claims";
import { processProject } from "@/lib/process-project";
import { runQueuedJob } from "@/lib/scrape-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** New scans reserve the normal quota. ?jobId= retries only never-started delivery. */
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  if (!await manageableProject(user.id, projectId)) return notFound();
  const billing = await ensureProjectSubscriptionApi(user.id, projectId);
  if (billing instanceof Response) return billing;
  const retryId = new URL(req.url).searchParams.get("jobId");
  let jobId: string;
  let jobType: "daily" | "manual" = "manual";
  if (retryId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(retryId)) return json({ error: "Invalid job ID" }, { status: 400 });
    const sql = requireSql();
    const rows = await sql`SELECT id,status,job_type FROM scrape_jobs WHERE id=${retryId} AND project_id=${projectId}` as Array<{ id: string; status: string; job_type: "daily" | "manual" }>;
    if (!rows[0]) return notFound();
    if (rows[0].status !== "pending") return json({ error: "Started scans cannot be replayed. Review the result before requesting a new scan." }, { status: 409 });
    jobId = rows[0].id; jobType = rows[0].job_type;
  } else {
    const claim = await claimManualRefresh(user.id, projectId, await isAdmin(user.id));
    if (claim instanceof Response) return claim;
    jobId = claim.jobId;
  }
  after(() => runQueuedJob(projectId, jobType, jobId, processProject));
  return json({ jobId, status: "pending" }, { status: 202 });
}

/** Durable status, scoped to project membership; no provider error text leaks. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  if (!await ownedProject(user.id, projectId)) return notFound();
  const sql = requireSql();
  const rows = await sql`SELECT id,status,stage,created_at,started_at,finished_at,
    (status='running' AND started_at < now()-interval '10 minutes') AS stale,
    (status='pending' AND created_at < now()-interval '2 minutes') AS delayed,
    error_message IS NOT NULL AS has_errors, result->'failedStages' AS failed_stages
    FROM scrape_jobs WHERE project_id=${projectId} ORDER BY created_at DESC,id DESC LIMIT 1`;
  return json({ job: rows[0] ?? null }, { headers: { "cache-control": "no-store" } });
}
