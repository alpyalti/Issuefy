/* Skeleton shown immediately while the dashboard page fetches its signals,
   summary and sources. Streams in via Next's loading.tsx convention so the
   user gets instant feedback after clicking. */
export default function DashboardLoading() {
  return (
    <div className="main-grid">
      <div className="feed">
        <SkeletonSummary />
        <SkeletonFeedHead />
        <SkeletonSignal />
        <SkeletonSignal />
        <SkeletonSignal />
      </div>
      <div className="rail">
        <SkeletonRail title="Recent sources" rows={5} />
        <SkeletonSaved />
      </div>
    </div>
  );
}

function pulse(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
    borderRadius: 6,
    ...extra,
  };
}

function SkeletonSummary() {
  return (
    <section className="brief-card" style={{ minHeight: 260 }}>
      <div className="brief-glow" />
      <div className="brief-head">
        <div className="brief-eyebrow" style={{ opacity: 0.5 }}>
          <span>AI summary</span>
          <span className="brief-sep">·</span>
          <span>Loading…</span>
        </div>
      </div>
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={pulse({ height: 18, width: "60%", background: "rgba(255,255,255,.06)" })} />
        <div style={pulse({ height: 14, width: "92%", background: "rgba(255,255,255,.06)" })} />
        <div style={pulse({ height: 14, width: "88%", background: "rgba(255,255,255,.06)" })} />
        <div style={pulse({ height: 14, width: "76%", background: "rgba(255,255,255,.06)" })} />
      </div>
    </section>
  );
}

function SkeletonFeedHead() {
  return (
    <div className="feed-head">
      <div style={pulse({ width: 360, height: 38, borderRadius: 10 })} />
      <div style={pulse({ width: 140, height: 18 })} />
    </div>
  );
}

function SkeletonSignal() {
  return (
    <article className="signal" style={{ animation: "rise .35s ease both" }}>
      <div className="signal-rail">
        <span className="sev-bar" style={{ background: "var(--ink-4)" }} />
      </div>
      <div className="signal-body">
        <div className="signal-top">
          <div className="signal-tags">
            <span style={pulse({ width: 90, height: 20, borderRadius: 999 })} />
            <span style={pulse({ width: 50, height: 16 })} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <div style={pulse({ height: 18, width: "85%" })} />
          <div style={pulse({ height: 14, width: "100%" })} />
          <div style={pulse({ height: 14, width: "92%" })} />
        </div>
        <div className="signal-foot" style={{ marginTop: 18 }}>
          <div style={pulse({ width: 120, height: 22, borderRadius: 999 })} />
          <div style={pulse({ width: 90, height: 14 })} />
        </div>
      </div>
    </article>
  );
}

function SkeletonRail({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="rail-card">
      <div className="rail-head">
        <h3>{title}</h3>
        <span className="rail-sub">Loading…</span>
      </div>
      <div className="rail-sources">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="rail-source" key={i} style={{ pointerEvents: "none" }}>
            <span className="favicon" style={{ ...pulse(), width: 26, height: 26, borderRadius: 6 }} />
            <span className="rail-src-meta" style={{ flex: 1, gap: 6 }}>
              <span style={pulse({ height: 12, width: "85%" })} />
              <span style={pulse({ height: 10, width: "60%" })} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkeletonSaved() {
  return (
    <section className="rail-card mini">
      <div className="rail-head"><h3>Saved</h3></div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span style={pulse({ height: 32, width: 40 })} />
        <span style={pulse({ height: 14, width: 140 })} />
      </div>
    </section>
  );
}
