import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { isAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, manageableProject, notFound, rateLimited } from "@/lib/api";
import { discoverLeadsForProject } from "@/lib/leads";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; keywordId: string }> };

const HOUR_MS = 60 * 60 * 1_000;

/**
 * POST /api/projects/:id/keywords/:keywordId/find-leads
 *
 * Manual "Find leads now" from the keyword hub. Editors + owners only.
 * Hourly per-keyword cooldown via MAX(keyword_leads.created_at); admins
 * bypass for testing.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId, keywordId } = await params;
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const kwRows = (await sql`
    SELECT id FROM keywords WHERE id = ${keywordId} AND project_id = ${projectId} AND is_active = true LIMIT 1
  `) as { id: string }[];
  if (kwRows.length === 0) return notFound();

  const admin = await isAdmin(user.id);
  if (!admin) {
    const lastRows = (await sql`
      SELECT MAX(created_at) AS last FROM keyword_leads WHERE keyword_id = ${keywordId}
    `) as { last: string | null }[];
    const last = lastRows[0]?.last;
    if (last && Date.now() - new Date(last).getTime() < HOUR_MS) {
      return rateLimited("Lead scan runs once per hour per keyword.");
    }
  }

  try {
    const telemetry = await discoverLeadsForProject(projectId, { onlyKeywordId: keywordId });
    return json(telemetry);
  } catch (e) {
    captureError(e, { stage: "find-leads.manual", projectId, keywordId });
    return json({ error: e instanceof Error ? e.message : "scan failed" }, { status: 500 });
  }
}
