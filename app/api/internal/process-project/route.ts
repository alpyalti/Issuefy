import { z } from "zod";
import { checkInternalSecret } from "@/lib/cron-auth";
import { processProject } from "@/lib/process-project";
import { json } from "@/lib/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
// PRD §13.10: the worker handles ONE project per invocation, so it can take
// a generous duration budget. 300 is the Hobby plan ceiling; bump to 800 on
// Pro if your projects routinely exceed 5 minutes (large scrape batches).
export const maxDuration = 300;

/**
 * Per-project WORKER (PRD §13.10).
 *
 *   POST /api/internal/process-project    Authorization: Bearer ${INTERNAL_WORKER_SECRET}
 *   body: { projectId: string, jobType: "daily" | "manual" }
 *
 * Each call gets its own invocation + duration budget. The bearer guard is
 * the only auth — Clerk middleware exempts this route. Body is Zod-validated.
 *
 * Runs the full Stage 1–4 pipeline via processProject() (PRD §13.3, §13.5,
 * §13.6, §21.3–.4):
 *   1. SERP discovery (weekly cadence)
 *   2. Standard scrape + dedup upsert (capped concurrency)
 *   3. AI signal extraction (Zod-validated, hallucination-filtered)
 *   4. Daily summary upsert (80–140 word gated)
 */
const workerBodySchema = z.object({
  projectId: z.string().min(1),
  jobType: z.enum(["daily", "manual"]).default("daily"),
}).strict();

export async function POST(req: Request) {
  const unauthorized = checkInternalSecret(req);
  if (unauthorized) return unauthorized;

  let parsed: { projectId: string; jobType: "daily" | "manual" };
  try {
    const raw = await req.json();
    const result = workerBodySchema.safeParse(raw);
    if (!result.success) {
      return json({ error: "Bad body", detail: result.error.issues }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const result = await processProject(parsed.projectId, parsed.jobType);
    return json(result);
  } catch (e) {
    captureError(e, { stage: "worker.handler", projectId: parsed.projectId });
    const msg = e instanceof Error ? e.message : "unknown error";
    return json({ error: msg }, { status: 500 });
  }
}
