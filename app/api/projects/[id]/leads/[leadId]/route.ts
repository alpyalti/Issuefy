import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, manageableProject, notFound, parseJson } from "@/lib/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; leadId: string }> };

const patchSchema = z.object({
  status: z.enum(["new", "saved", "dismissed", "replied"]),
}).strict();

/**
 * PATCH /api/projects/:id/leads/:leadId — update a lead's status
 * (saved / dismissed / replied). Editors + owners only.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId, leadId } = await params;
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();

  const body = await parseJson(req, patchSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  try {
    const rows = (await sql`
      UPDATE keyword_leads SET status = ${body.status}, updated_at = now()
      WHERE id = ${leadId} AND project_id = ${projectId}
      RETURNING id, status
    `) as Array<{ id: string; status: string }>;
    if (rows.length === 0) return notFound();
    return json({ lead: rows[0] });
  } catch (e) {
    captureError(e, { stage: "lead.patch", projectId, leadId });
    return json({ error: e instanceof Error ? e.message : "update failed" }, { status: 500 });
  }
}
