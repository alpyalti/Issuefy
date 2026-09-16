import { after } from "next/server";
import { configuredEnv } from "@/lib/env";
import { checkCronSecret } from "@/lib/cron-auth";
import { json } from "@/lib/api";
import { enqueueDailyJobs, recordDispatchFailure } from "@/lib/scrape-jobs";
import { fetchWithTimeout } from "@/lib/fetch";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;
const CONCURRENCY = 4;

/** All jobs are committed before acknowledgement. HTTP only nudges durable IDs. */
async function handle(req: Request) {
  const unauthorized = checkCronSecret(req);
  if (unauthorized) return unauthorized;
  const secret = configuredEnv(process.env.INTERNAL_WORKER_SECRET);
  if (!secret) return json({ error: "INTERNAL_WORKER_SECRET not configured" }, { status: 503 });
  try {
    const jobs = await enqueueDailyJobs();
    const base = (process.env.APP_URL?.trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/+$/, "");
    after(async () => {
      for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        await Promise.allSettled(jobs.slice(i, i + CONCURRENCY).map(async job => {
          try {
            const response = await fetchWithTimeout(`${base}/api/internal/process-project`, {
              method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
              body: JSON.stringify({ projectId: job.project_id, jobId: job.id }),
            }, 5000);
            if (!response.ok) throw new Error(`Worker acknowledgement HTTP ${response.status}`);
            await response.body?.cancel();
          } catch (error) {
            await recordDispatchFailure(job.id, "Delivery not acknowledged; pending job retained for retry");
            captureError(error, { stage: "dispatcher.delivery", jobId: job.id });
          }
        }));
      }
    });
    return json({ queued: jobs.length, status: "pending" }, { status: 202 });
  } catch (error) {
    captureError(error, { stage: "dispatcher.enqueue" });
    return json({ error: "Could not queue scans" }, { status: 500 });
  }
}
export { handle as GET, handle as POST };
