"use client";

/**
 * Plan-usage meter for the settings page (PRD §17.5).
 *
 * Surfaces the 4 counters that drive the cost-control story (§21.3):
 *   - Sources this month / sourcesPerMonth
 *   - AI signals this month / signalsPerMonth
 *   - SERP discovery calls / serpCallsPerCycle
 *   - Scrape calls / scrapeCallsPerCycle
 *
 * Color rises through green → warn → neg as the meter approaches the cap.
 */
export interface UsageMeterRow {
  label: string;
  used: number;
  limit: number;
  note?: string;
}

function fmt(n: number) {
  return n >= 1_000 ? n.toLocaleString() : String(n);
}

function colorFor(used: number, limit: number) {
  if (limit <= 0) return { bar: "var(--ink-3)", text: "var(--ink-3)" };
  const pct = used / limit;
  if (pct >= 1) return { bar: "var(--neg)", text: "var(--neg)" };
  if (pct >= 0.8) return { bar: "var(--warn)", text: "var(--warn)" };
  return { bar: "var(--accent)", text: "var(--ink-2)" };
}

export function UsageMeter({ rows, title = "Plan usage" }: { rows: UsageMeterRow[]; title?: string }) {
  return (
    <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>{title}</h3>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          This billing cycle
        </span>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((r) => {
          const pct = r.limit > 0 ? Math.min(100, (r.used / r.limit) * 100) : 0;
          const c = colorFor(r.used, r.limit);
          return (
            <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{r.label}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: c.text }}>
                  {fmt(r.used)} <span style={{ color: "var(--ink-4)" }}>/ {fmt(r.limit)}</span>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                <div style={{ width: pct + "%", height: "100%", background: c.bar, transition: "width .4s ease" }} />
              </div>
              {r.note && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>{r.note}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
