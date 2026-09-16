import { requireUser } from "@/lib/clerk-user";
import { ensureProjectSubscriptionApi } from "@/lib/billing-gate";
import { addWatchlistItem } from "@/lib/watchlist-claims";
import { getLimits, HARD_CAPS } from "@/lib/usage";
import { json, manageableProject, notFound, parseJson } from "@/lib/api";
import { keywordCreateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/keywords — add a keyword. Enforces plan + hard cap.
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  // Editors + owners can manage watchlist; viewers get 404.
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();
  const billing = await ensureProjectSubscriptionApi(user.id, projectId);
  if (billing instanceof Response) return billing;

  const body = await parseJson(req, keywordCreateSchema);
  if (body instanceof Response) return body;

  const limit = Math.min(getLimits(billing.plan).keywordsPerProject, HARD_CAPS.keywordsPerProject);

  // last_discovered_at stays NULL → the worker will treat this keyword as due
  // for discovery on the next run, regardless of the weekly cadence (PRD §10.7).
  const result = await addWatchlistItem(user.id, projectId, billing.ownerId, "keywords", limit, async (client) => {
    const { rows } = await client.query(
      "INSERT INTO keywords (project_id, keyword) VALUES ($1,$2) RETURNING *", [projectId, body.keyword],
    );
    return rows[0];
  });
  if (result instanceof Response) return result;
  return json({ keyword: result }, { status: 201 });
}
