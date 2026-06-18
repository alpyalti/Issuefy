import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { requireSql } from "@/lib/db";
import { json, manageableProject, notFound } from "@/lib/api";
import { draftLeadReply } from "@/lib/leads";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; leadId: string }> };

/**
 * POST /api/projects/:id/leads/:leadId/draft-reply
 *
 * On-demand: generate (and persist) a suggested reply for one lead.
 * Editors + owners only; the lead must belong to the project.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId, leadId } = await params;
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();

  const sql = requireSql();
  const rows = (await sql`
    SELECT id FROM keyword_leads WHERE id = ${leadId} AND project_id = ${projectId} LIMIT 1
  `) as { id: string }[];
  if (rows.length === 0) return notFound();

  try {
    const { reply } = await draftLeadReply(leadId, projectId);
    return json({ reply });
  } catch (e) {
    captureError(e, { stage: "lead.draftReply", projectId, leadId });
    return json({ error: e instanceof Error ? e.message : "draft failed" }, { status: 500 });
  }
}
