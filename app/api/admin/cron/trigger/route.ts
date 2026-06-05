import { requireAdminApi } from "@/lib/admin";
import { json } from "@/lib/api";
import { captureBreadcrumb } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/cron/trigger — server-side proxy that fires the daily cron
 * with the correct CRON_SECRET. Admins don't need to know the secret.
 */
export async function POST() {
  const admin = await requireAdminApi();
  if (admin instanceof Response) return admin;
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/cron/daily-scrape`, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    return json({ error: `Cron returned ${res.status}` }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  captureBreadcrumb("admin.cron_triggered", { actor: admin.id, dispatched: data.dispatched });
  return json(data);
}
