import { after } from "next/server";
import { z } from "zod";
import { checkInternalSecret } from "@/lib/cron-auth";
import { processProject } from "@/lib/process-project";
import { requireSql } from "@/lib/db";
import { runQueuedJob } from "@/lib/scrape-jobs";
import { json } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.object({ projectId: z.string().uuid(), jobId: z.string().uuid() }).strict();

/** Acknowledge the durable ID before processing; delivery retries never mint jobs. */
export async function POST(req: Request) {
  const unauthorized = checkInternalSecret(req);
  if (unauthorized) return unauthorized;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Valid projectId and jobId required" }, { status: 400 });
  const { projectId, jobId } = parsed.data;
  const sql = requireSql();
  const rows = await sql`SELECT id,status,job_type FROM scrape_jobs WHERE id=${jobId} AND project_id=${projectId}` as Array<{ id: string; status: string; job_type: "daily" | "manual" }>;
  if (!rows[0]) return json({ error: "Job not found" }, { status: 404 });
  if (rows[0].status === "pending") after(() => runQueuedJob(projectId, rows[0].job_type, jobId, processProject));
  return json({ jobId, status: rows[0].status }, { status: rows[0].status === "pending" ? 202 : 200 });
}
