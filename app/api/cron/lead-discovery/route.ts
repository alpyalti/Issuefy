import { after } from "next/server";
import { checkCronSecret } from "@/lib/cron-auth";
import { requireSql } from "@/lib/db";
import { json } from "@/lib/api";
import { captureBreadcrumb, captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lead-discovery cron DISPATCHER.
 *
 *   GET/POST /api/cron/lead-discovery   Authorization: Bearer ${CRON_SECRET}
 *
 * Daily at 05:30 UTC (after social 05:00, before the brief 06:00). No work
 * here — enumerate active projects with at least one active keyword and fan
 * out per-project HTTP calls to the internal worker, each with its own
 * invocation + duration budget. Same shape as the social-profiles dispatcher.
 */
const KICKOFF_CONCURRENCY = 4;

async function listKeywordProjects(): Promise<{ id: string }[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT DISTINCT p.id
    FROM projects p
    JOIN keywords k ON k.project_id = p.id
    WHERE p.is_active = true AND k.is_active = true
    ORDER BY p.id
  `) as { id: string }[];
  return rows;
}

function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function kickoffWorker(projectId: string, secret: string, base: string): Promise<void> {
  try {
    await fetch(`${base}/api/internal/lead-discovery`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ projectId }),
    });
    captureBreadcrumb("lead-dispatcher.kickoff", { projectId });
  } catch (e) {
    captureError(e, { stage: "lead-dispatcher.kickoff", projectId });
  }
}

async function handle(req: Request) {
  const unauthorized = checkCronSecret(req);
  if (unauthorized) return unauthorized;

  let projects: { id: string }[] = [];
  try {
    projects = await listKeywordProjects();
  } catch (e) {
    captureError(e, { stage: "lead-dispatcher.list" });
    return json({ error: "Could not enumerate projects" }, { status: 500 });
  }

  const internalSecret = process.env.INTERNAL_WORKER_SECRET || "";
  if (!internalSecret) {
    return json({ error: "INTERNAL_WORKER_SECRET not configured" }, { status: 503 });
  }
  const base = appUrl();

  after(async () => {
    for (let i = 0; i < projects.length; i += KICKOFF_CONCURRENCY) {
      const batch = projects.slice(i, i + KICKOFF_CONCURRENCY);
      await Promise.allSettled(batch.map((p) => kickoffWorker(p.id, internalSecret, base)));
    }
  });

  return json({ dispatched: projects.length });
}

export { handle as GET, handle as POST };
