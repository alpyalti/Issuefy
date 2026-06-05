import { after } from "next/server";
import { checkCronSecret } from "@/lib/cron-auth";
import { requireSql } from "@/lib/db";
import { json } from "@/lib/api";
import { captureBreadcrumb, captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron DISPATCHER (PRD §13.10).
 *
 *   POST /api/cron/daily-scrape   Authorization: Bearer ${CRON_SECRET}
 *
 * The dispatcher does NO scraping or AI work itself. It enumerates active
 * projects, then fires per-project HTTP calls to the worker route, each
 * receiving its own function invocation with its own duration budget.
 *
 * Critical detail (validated in the build plan):
 *   We wrap the fan-out in `after()` so the dispatcher responds quickly
 *   while the un-awaited fetches still flush in the background. Doing the
 *   work inside `after()` ON THIS invocation would recreate the forbidden
 *   single-invocation pattern — we MUST hop via fetch so each project gets
 *   its own duration budget. APP_URL is the absolute URL (relative paths
 *   don't resolve server-side).
 */
const KICKOFF_CONCURRENCY = 4;

interface ActiveProject {
  id: string;
  user_id: string;
}

async function listActiveProjects(): Promise<ActiveProject[]> {
  const sql = requireSql();
  // "Active" = at least one active competitor OR three active keywords.
  // PRD §13.1 acceptance: a project must have ≥1 competitor or ≥3 keywords
  // before monitoring starts.
  const rows = (await sql`
    SELECT DISTINCT p.id, p.user_id
    FROM projects p
    WHERE EXISTS (
        SELECT 1 FROM competitors c WHERE c.project_id = p.id AND c.is_active = true
      )
       OR (
        SELECT COUNT(*) FROM keywords k WHERE k.project_id = p.id AND k.is_active = true
      ) >= 3
    ORDER BY p.id
  `) as ActiveProject[];
  return rows;
}

function appUrl(): string {
  // APP_URL is the canonical absolute base; VERCEL_URL is the fallback when
  // deploying to a Preview that doesn't have a custom domain yet.
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function kickoffWorker(projectId: string, secret: string, base: string): Promise<void> {
  try {
    // Intentionally not awaited end-to-end via response.text() — we just want
    // the request to flush. `after()` keeps the function alive past response.
    await fetch(`${base}/api/internal/process-project`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ projectId, jobType: "daily" }),
    });
    captureBreadcrumb("dispatcher.kickoff", { projectId });
  } catch (e) {
    captureError(e, { stage: "dispatcher.kickoff", projectId });
  }
}

export async function POST(req: Request) {
  const unauthorized = checkCronSecret(req);
  if (unauthorized) return unauthorized;

  let projects: ActiveProject[] = [];
  try {
    projects = await listActiveProjects();
  } catch (e) {
    captureError(e, { stage: "dispatcher.list" });
    return json({ error: "Could not enumerate projects" }, { status: 500 });
  }

  const internalSecret = process.env.INTERNAL_WORKER_SECRET || "";
  if (!internalSecret) {
    return json({ error: "INTERNAL_WORKER_SECRET not configured" }, { status: 503 });
  }
  const base = appUrl();

  // Schedule the fan-out for AFTER the response is sent. This keeps the
  // dispatcher's invocation short while the kick-off fetches still complete,
  // so the requests reach the worker route and start independent invocations
  // there (each with its own duration budget — see worker maxDuration).
  after(async () => {
    // Capped concurrency so we don't open hundreds of sockets at once.
    for (let i = 0; i < projects.length; i += KICKOFF_CONCURRENCY) {
      const batch = projects.slice(i, i + KICKOFF_CONCURRENCY);
      await Promise.allSettled(batch.map((p) => kickoffWorker(p.id, internalSecret, base)));
    }
  });

  return json({ dispatched: projects.length });
}
