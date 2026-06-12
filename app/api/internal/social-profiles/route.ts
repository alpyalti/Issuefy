import { z } from "zod";
import { checkInternalSecret } from "@/lib/cron-auth";
import { refreshSocialProfiles } from "@/lib/social-profile";
import { json } from "@/lib/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
// One project per invocation. The Apify batch call alone can take 1–3 min
// for a 10-handle project, so take the full Hobby-ceiling budget.
export const maxDuration = 300;

/**
 * Per-project social-profiles WORKER (Competitor Hub).
 *
 *   POST /api/internal/social-profiles    Authorization: Bearer ${INTERNAL_WORKER_SECRET}
 *   body: { projectId: string }
 *
 * Bearer guard is the only auth — Clerk middleware exempts /api/internal/**.
 * Runs the full social refresh for one project: Apify Instagram batch,
 * YouTube/Reddit/LinkedIn stats, daily snapshots, delta signals, AI insight.
 */
const bodySchema = z.object({
  projectId: z.string().min(1),
}).strict();

export async function POST(req: Request) {
  const unauthorized = checkInternalSecret(req);
  if (unauthorized) return unauthorized;

  let projectId: string;
  try {
    const raw = await req.json();
    const result = bodySchema.safeParse(raw);
    if (!result.success) {
      return json({ error: "Bad body", detail: result.error.issues }, { status: 400 });
    }
    projectId = result.data.projectId;
  } catch {
    return json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const telemetry = await refreshSocialProfiles(projectId);
    return json(telemetry);
  } catch (e) {
    captureError(e, { stage: "social-worker.handler", projectId });
    return json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
