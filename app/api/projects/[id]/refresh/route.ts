import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { isAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, manageableProject, notFound, rateLimited } from "@/lib/api";
import { getLimits } from "@/lib/usage";
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
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId } = await params;
  // Editors + owners can burn a refresh; viewers can't trigger billable scrapes.
  const proj = await manageableProject<{ id: string; last_manual_refresh_at: string | null }>(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const limits = getLimits(user.plan);

  // Admins bypass the refresh limits entirely (testing convenience).
  const admin = await isAdmin(user.id);
  if (!admin) {
    // Per-hour floor: simply check projects.last_manual_refresh_at.
    if (proj.last_manual_refresh_at) {
      const last = new Date(proj.last_manual_refresh_at).getTime();
      if (Date.now() - last < HOUR_MS) {
        return rateLimited("You can refresh this project once per hour.");
      }
    }

    // Daily plan quota: count today's MANUAL scrape_jobs for this user across
    // all their projects (limits are account-wide, PRD §21.1).
    const todayCountRows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM scrape_jobs sj
      JOIN projects p ON p.id = sj.project_id
      WHERE p.user_id = ${user.id}
        AND sj.job_type = 'manual'
        AND sj.created_at >= ${new Date(Date.now() - DAY_MS).toISOString()}
    `) as { n: number }[];
    if ((todayCountRows[0]?.n ?? 0) >= limits.manualRefreshesPerDay) {
      return rateLimited("You've used all your refreshes for today.");
    }
  }

  // Stamp last_manual_refresh_at BEFORE running so concurrent clicks don't
  // both pass the per-hour gate.
  await sql`UPDATE projects SET last_manual_refresh_at = now() WHERE id = ${projectId}`;

  try {
    const result = await processProject(projectId, "manual");
    return json(result);
  } catch (e) {
    captureError(e, { stage: "refresh.handler", projectId });
    return json({ error: e instanceof Error ? e.message : "refresh failed" }, { status: 500 });
  }
}
