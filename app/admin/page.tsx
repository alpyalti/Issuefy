import { requireSql } from "@/lib/db";
import { Icon } from "@/components/icons/Icon";
import { currentPeriodStart } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const sql = requireSql();
  const period = currentPeriodStart();

  const [usersByPlanRaw, totalsRaw, monthlyUsageRaw, recentSignupsRaw] = await Promise.all([
    sql`SELECT plan, COUNT(*)::int AS n FROM users GROUP BY plan ORDER BY plan`,
    sql`SELECT
        (SELECT COUNT(*)::int FROM projects WHERE is_active = true) AS projects,
        (SELECT COUNT(*)::int FROM signals WHERE created_at >= date_trunc('month', now())) AS signals_this_month,
        (SELECT COUNT(*)::int FROM sources WHERE scraped_at >= date_trunc('month', now())) AS sources_this_month,
        (SELECT COUNT(*)::int FROM users) AS total_users
    `,
    sql`
      SELECT COALESCE(SUM(serp_calls),0)::int AS serp,
             COALESCE(SUM(scrape_calls),0)::int AS scrape,
             COALESCE(SUM(sources_stored),0)::int AS sources_stored,
             COALESCE(SUM(signals_generated),0)::int AS signals_generated
      FROM usage_counters WHERE period_start = ${period}
    `,
    sql`
      SELECT email, plan, created_at FROM users
      ORDER BY created_at DESC LIMIT 10
    `,
  ]);
  const usersByPlan = usersByPlanRaw as unknown as Array<{ plan: string; n: number }>;
  const totals = totalsRaw as unknown as Array<{ projects: number; signals_this_month: number; sources_this_month: number; total_users: number }>;
  const monthlyUsage = monthlyUsageRaw as unknown as Array<{ serp: number; scrape: number; sources_stored: number; signals_generated: number }>;
  const recentSignups = recentSignupsRaw as unknown as Array<{ email: string; plan: string; created_at: string }>;

  const grandTotals = totals[0] ?? { projects: 0, signals_this_month: 0, sources_this_month: 0, total_users: 0 };
  const usage = monthlyUsage[0] ?? { serp: 0, scrape: 0, sources_stored: 0, signals_generated: 0 };

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <header>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30 }}>Overview</h1>
        <p className="muted" style={{ marginTop: 4 }}>Platform-wide stats for {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}.</p>
      </header>

      <section className="stats-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Stat label="Total users" value={grandTotals.total_users} icon="Target01Icon" tone="info" />
        <Stat label="Active projects" value={grandTotals.projects} icon="DashboardSquare01Icon" tone="info" />
        <Stat label="Signals this month" value={grandTotals.signals_this_month} icon="FlashIcon" tone="pos" />
        <Stat label="Sources this month" value={grandTotals.sources_this_month} icon="News01Icon" tone="mute" />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 12 }}>Users by plan</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {usersByPlan.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No users yet.</p>}
            {usersByPlan.map((r) => (
              <div key={r.plan} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 14, color: "var(--ink)", textTransform: "capitalize" }}>{r.plan}</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{r.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 12 }}>API calls this month</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <UsageRow label="SERP calls" value={usage.serp} />
            <UsageRow label="Scrape calls" value={usage.scrape} />
            <UsageRow label="Sources stored" value={usage.sources_stored} />
            <UsageRow label="Signals generated" value={usage.signals_generated} />
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 22 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 14 }}>Recent signups</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {recentSignups.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No signups yet.</p>}
          {recentSignups.map((u) => (
            <div key={u.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontSize: 13.5 }}>{u.email}</span>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="pill pill-info" style={{ fontSize: 11 }}>{u.plan}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{new Date(u.created_at).toLocaleDateString()}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: "FlashIcon" | "Target01Icon" | "DashboardSquare01Icon" | "News01Icon"; tone: string }) {
  return (
    <div className={"stat tone-" + tone}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-ic"><Icon name={icon} size={17} stroke={1.7} /></span>
      </div>
      <div className="stat-bottom">
        <span className="stat-num">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 13.5 }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{value.toLocaleString()}</span>
    </div>
  );
}
