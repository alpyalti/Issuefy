import { requireUser } from "@/lib/clerk-user";
import { ensureProjectSubscriptionApi } from "@/lib/billing-gate";
import { addWatchlistItem } from "@/lib/watchlist-claims";
import { getLimits, HARD_CAPS } from "@/lib/usage";
import { json, manageableProject, notFound, parseJson } from "@/lib/api";
import { competitorCreateSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/competitors — add a competitor by URL (+ optional
// confirmed enrichment fields). Enforces per-project plan cap AND hard cap of 5.
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  // Editors + owners can manage watchlist; viewers get 404.
  const proj = await manageableProject(user.id, projectId);
  if (!proj) return notFound();
  const billing = await ensureProjectSubscriptionApi(user.id, projectId);
  if (billing instanceof Response) return billing;

  const body = await parseJson(req, competitorCreateSchema);
  if (body instanceof Response) return body;

  const limit = Math.min(getLimits(billing.plan).competitorsPerProject, HARD_CAPS.competitorsPerProject);

  // Pick a sensible name from the body or fall back to the host.
  const inferredName = body.name?.trim() || body.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  const status = body.name || body.description || body.logo_url || body.socials ? "manual" : null;
  // Phase 3 will replace `null` here with the real enrichment_status from /api/enrich.

  const result = await addWatchlistItem(user.id, projectId, billing.ownerId, "competitors", limit, async (client) => {
    const { rows } = await client.query(`INSERT INTO competitors (
      project_id, name, website_url, description, logo_url, socials, notes, enrichment_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [
      projectId, inferredName, body.website_url, body.description ?? null,
      body.logo_url ?? null, body.socials ? JSON.stringify(body.socials) : null,
      body.notes ?? null, status,
    ]);
    return rows[0];
  });
  if (result instanceof Response) return result;
  return json({ competitor: result }, { status: 201 });
}
