import { requireAdmin } from "@/lib/admin";
import CronTriggerButton from "@/components/admin/CronTriggerButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  await requireAdmin();
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <header>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30 }}>Settings</h1>
        <p className="muted" style={{ marginTop: 4 }}>Operations toggles & ops actions.</p>
      </header>

      <section className="card" style={{ padding: 22 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 8 }}>Daily cron</h2>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 540 }}>
          The daily scrape normally fires at 06:00 UTC via Vercel Cron. Use this to trigger an out-of-band run for testing.
        </p>
        <div style={{ marginTop: 14 }}>
          <CronTriggerButton />
        </div>
      </section>

      <section className="card" style={{ padding: 22 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 8 }}>System status</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13.5 }}>
          <StatusRow label="BETA_STARTER_LIMITS" value={process.env.BETA_STARTER_LIMITS !== "false" ? "on" : "off"} note="When on, every account is served Starter limits regardless of plan." />
          <StatusRow label="SENTRY_DSN" value={process.env.SENTRY_DSN ? "set" : "missing"} note="Real Sentry integration lands in Sprint G." />
          <StatusRow label="R2_ENABLED" value={process.env.R2_ENABLED === "true" ? "on" : "off"} note="Raw HTML archive." />
          <StatusRow label="STRIPE_SECRET_KEY" value={process.env.STRIPE_SECRET_KEY ? "set" : "missing"} note="Billing routes return 501 when missing." />
          <StatusRow label="APP_URL" value={process.env.APP_URL ?? "(not set)"} note="Used by cron dispatcher + webhook redirects." />
        </div>
      </section>
    </div>
  );
}

function StatusRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <>
      <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", letterSpacing: ".06em" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{value}</span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>· {note}</span>
      </span>
    </>
  );
}
