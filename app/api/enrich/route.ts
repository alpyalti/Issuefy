import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { parseJson, json, rateLimited } from "@/lib/api";
import { enrichRequestSchema } from "@/lib/schemas/api";
import { enrichWebsite } from "@/lib/enrichment";
import { reserveCalls } from "@/lib/usage-counters";
import { getLimits } from "@/lib/usage";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 30; // ScraperAPI timeout is 25s; give the handler 5s of headroom.

/**
 * POST /api/enrich   body: { url }
 *
 * Fetches a homepage via the same standard ScraperAPI endpoint used by daily
 * scraping (PRD §13.11 — counts as ONE scrape call against the user's monthly
 * budget). On success returns the discovered profile; on failure returns a
 * partial profile with status="failed" so the UI can fall back to manual entry.
 * Ownership: any signed-in user may call this for any URL — the result is
 * cached in-memory only, no DB writes here.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;

  const body = await parseJson(req, enrichRequestSchema);
  if (body instanceof Response) return body;

  // Reserve a scrape call BEFORE issuing it. If the user is already over budget
  // for this cycle, surface a 429 — the UI can show "limit reached, upgrade".
  const limits = getLimits(user.plan);
  try {
    const after = await reserveCalls(user.id, "scrape_calls", 1);
    if (after > limits.scrapeCallsPerCycle) {
      return rateLimited(`You've reached this cycle's scrape budget. Upgrade your plan to keep monitoring.`);
    }
  } catch (e) {
    captureError(e, { route: "POST /api/enrich", userId: user.id });
    return json({ error: "Could not reserve scrape budget" }, { status: 500 });
  }

  try {
    const profile = await enrichWebsite(body.url);
    return json({ profile });
  } catch (e) {
    captureError(e, { route: "POST /api/enrich", url: body.url });
    return json({ profile: null, error: e instanceof Error ? e.message : "enrichment failed" }, { status: 502 });
  }
}
