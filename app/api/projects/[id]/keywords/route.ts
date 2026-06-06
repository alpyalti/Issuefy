import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { requireSql } from "@/lib/db";
import { getLimits, HARD_CAPS } from "@/lib/usage";
import { conflict, json, manageableProject, notFound, parseJson } from "@/lib/api";
import { keywordCreateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/keywords — add a keyword. Enforces plan + hard cap.
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const { id: projectId } = await params;
  // Editors + owners can manage watchlist; viewers get 404.
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();

  const body = await parseJson(req, keywordCreateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const limit = Math.min(getLimits(user.plan).keywordsPerProject, HARD_CAPS.keywordsPerProject);
  const countRows = (await sql`SELECT COUNT(*)::int AS n FROM keywords WHERE project_id = ${projectId}`) as { n: number }[];
  if ((countRows[0]?.n ?? 0) >= limit) {
    return conflict(`This project allows ${limit} keyword${limit === 1 ? "" : "s"}. Remove one or upgrade your plan.`);
  }

  // last_discovered_at stays NULL → the worker will treat this keyword as due
  // for discovery on the next run, regardless of the weekly cadence (PRD §10.7).
  const rows = await sql`
    INSERT INTO keywords (project_id, keyword)
    VALUES (${projectId}, ${body.keyword})
    RETURNING *
  `;
  return json({ keyword: rows[0] }, { status: 201 });
}
