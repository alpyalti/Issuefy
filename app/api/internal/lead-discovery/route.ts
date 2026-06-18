import { z } from "zod";
import { checkInternalSecret } from "@/lib/cron-auth";
import { discoverLeadsForProject } from "@/lib/leads";
import { json } from "@/lib/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
// One project per invocation: searching every keyword across two platforms +
// a classify call each takes a while. Full Hobby-ceiling budget.
export const maxDuration = 300;

/**
 * Per-project lead-discovery WORKER.
 *
 *   POST /api/internal/lead-discovery   Authorization: Bearer ${INTERNAL_WORKER_SECRET}
 *   body: { projectId: string }
 *
 * Bearer guard is the only auth — Clerk middleware exempts /api/internal/**.
 */
const bodySchema = z.object({ projectId: z.string().min(1) }).strict();

export async function POST(req: Request) {
  const unauthorized = checkInternalSecret(req);
  if (unauthorized) return unauthorized;

  let projectId: string;
  try {
    const raw = await req.json();
    const result = bodySchema.safeParse(raw);
    if (!result.success) return json({ error: "Bad body", detail: result.error.issues }, { status: 400 });
    projectId = result.data.projectId;
  } catch {
    return json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const telemetry = await discoverLeadsForProject(projectId);
    return json(telemetry);
  } catch (e) {
    captureError(e, { stage: "lead-worker.handler", projectId });
    return json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
