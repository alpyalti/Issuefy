import { requireUser } from "@/lib/clerk-user";
import { ensureProjectSubscriptionApi } from "@/lib/billing-gate";
import { isAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, manageableProject, notFound } from "@/lib/api";
import { claimManualRefresh } from "@/lib/entitlement-claims";
import { processProject } from "@/lib/process-project";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
// Manual refresh re-runs the entire pipeline for one project — match the
// worker's duration budget. 300 = Hobby plan max; raise to 800 on Pro.
export const maxDuration = 300;

/**
 * POST /api/projects/:id/refresh    (Clerk-authed via middleware)
 *
 * Runs the SAME per-project pipeline as the daily cron (PRD §13.9). Reuses
 * processProject() directly (not via the worker fetch) since the user is
 * already authenticated on this route — going through the worker would be
 * one extra hop with no isolation benefit (only one project at a time).
 *
 * Limits enforced:
 *   - Anti-abuse floor: max 1 refresh per HOUR per project (all plans)
 *   - Plan quota: total refreshes per DAY per the plan
 *
 * 429 with a clear message when blocked (PRD §24 error copy).
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  // Editors + owners can burn a refresh; viewers can't trigger billable scrapes.
  const proj = await manageableProject<{ id: string; last_manual_refresh_at: string | null }>(user.id, projectId);
  if (!proj) return notFound();
  const billing = await ensureProjectSubscriptionApi(user.id, projectId);
  if (billing instanceof Response) return billing;

  // Commit the cooldown and quota reservation before starting paid work.
  const claim = await claimManualRefresh(user.id, projectId, await isAdmin(user.id));
  if (claim instanceof Response) return claim;

  try {
    const result = await processProject(projectId, "manual", claim.jobId);
    return json(result);
  } catch (e) {
    // Entry checks can reject before consuming the reservation. Keep failed
    // attempts counted, matching the existing manual-job quota semantics.
    const sql = requireSql();
    await sql`UPDATE scrape_jobs SET status = 'failed', finished_at = now(),
      error_message = 'Manual refresh failed before worker start'
      WHERE id = ${claim.jobId} AND status = 'pending'`;
    captureError(e, { stage: "refresh.handler", projectId });
    return json({ error: e instanceof Error ? e.message : "refresh failed" }, { status: 500 });
  }
}
