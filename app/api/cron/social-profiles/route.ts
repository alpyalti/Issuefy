import { after } from "next/server";
import { checkCronSecret } from "@/lib/cron-auth";
import { requireSql } from "@/lib/db";
import { json } from "@/lib/api";
import { captureBreadcrumb, captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Social-profiles cron DISPATCHER (Competitor Hub).
 *
 *   GET/POST /api/cron/social-profiles   Authorization: Bearer ${CRON_SECRET}
 *
 * Runs daily at 05:00 UTC — one hour before the daily-scrape dispatcher, so
 * fresh social snapshots + delta signals are already in the DB when the
 * morning brief generates.
 *
 * Same architecture as daily-scrape: no fetching here, just enumerate
 * projects that have at least one active competitor with a monitored social
 * link, then fan out per-project HTTP calls to the internal worker (each
 * gets its own invocation + duration budget).
 */
const KICKOFF_CONCURRENCY = 4;

async function listSocialProjects(): Promise<{ id: string }[]> {
  const sql = requireSql();
  // ?| is the JSONB "has any of these keys" operator.
  const rows = (await sql`
    SELECT DISTINCT p.id
    FROM projects p
    JOIN competitors c ON c.project_id = p.id
    WHERE p.is_active = true
      AND c.is_active = true
      AND c.socials IS NOT NULL
      AND c.socials ?| array['instagram','youtube','reddit','linkedin']
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
    await fetch(`${base}/api/internal/social-profiles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ projectId }),
    });
    captureBreadcrumb("social-dispatcher.kickoff", { projectId });
  } catch (e) {
    captureError(e, { stage: "social-dispatcher.kickoff", projectId });
  }
}

async function handle(req: Request) {
  const unauthorized = checkCronSecret(req);
  if (unauthorized) return unauthorized;

  let projects: { id: string }[] = [];
  try {
    projects = await listSocialProjects();
  } catch (e) {
    captureError(e, { stage: "social-dispatcher.list" });
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
