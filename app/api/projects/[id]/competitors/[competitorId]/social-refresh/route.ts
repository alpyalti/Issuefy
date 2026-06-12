import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { isAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, manageableProject, notFound, rateLimited } from "@/lib/api";
import { refreshSocialProfiles } from "@/lib/social-profile";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
// Manual refresh runs the same per-competitor pipeline as the cron worker —
// a single-handle Apify call typically lands in 20–60s, but give headroom.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; competitorId: string }> };

const HOUR_MS = 60 * 60 * 1_000;

/**
 * POST /api/projects/:id/competitors/:competitorId/social-refresh
 *
 * Manual "Refresh social data" from the Competitor Hub. Editors + owners
 * only (viewers can't burn the owner's Apify/scrape budget). Hourly
 * per-competitor cooldown via MAX(social_profiles.last_fetched_at) —
 * mirrors the project-refresh hourly floor.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId, competitorId } = await params;
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const compRows = (await sql`
    SELECT id FROM competitors
    WHERE id = ${competitorId} AND project_id = ${projectId} AND is_active = true
    LIMIT 1
  `) as { id: string }[];
  if (compRows.length === 0) return notFound();

  // Hourly cooldown — any fetch attempt (ok or failed) within the last hour
  // blocks another. Covers double-clicks and refresh-spam alike. Admins are
  // exempt so they can hammer-test the Apify/social pipeline freely.
  const admin = await isAdmin(user.id);
  if (!admin) {
    const lastRows = (await sql`
      SELECT MAX(last_fetched_at) AS last FROM social_profiles
      WHERE competitor_id = ${competitorId}
    `) as { last: string | null }[];
    const last = lastRows[0]?.last;
    if (last && Date.now() - new Date(last).getTime() < HOUR_MS) {
      return rateLimited("Social data refreshes once per hour per competitor.");
    }
  }

  try {
    const telemetry = await refreshSocialProfiles(projectId, { onlyCompetitorId: competitorId });
    return json(telemetry);
  } catch (e) {
    captureError(e, { stage: "social-refresh.manual", projectId, competitorId });
    return json({ error: e instanceof Error ? e.message : "refresh failed" }, { status: 500 });
  }
}
