import { Skeleton } from "@/components/ui/Skeleton";

/* Skeleton shown immediately while the project dashboard fetches its
   signals, summary and sources. Streams in via Next's loading.tsx
   convention so the user gets instant feedback after clicking. */
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

/* The summary card sits on a dark hero panel — using the rail's lighter
   shimmer would be invisible. Use a per-line white-overlay style instead. */
const DARK_SHIMMER: React.CSSProperties = {
  background: "rgba(255,255,255,.06)",
  borderRadius: 6,
  display: "block",
};

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
        <span style={{ ...DARK_SHIMMER, height: 18, width: "60%" }} aria-hidden="true" />
        <span style={{ ...DARK_SHIMMER, height: 14, width: "92%" }} aria-hidden="true" />
        <span style={{ ...DARK_SHIMMER, height: 14, width: "88%" }} aria-hidden="true" />
        <span style={{ ...DARK_SHIMMER, height: 14, width: "76%" }} aria-hidden="true" />
      </div>
    </section>
  );
}

function SkeletonFeedHead() {
  return (
    <div className="feed-head">
      <Skeleton width={360} height={38} radius={10} />
      <Skeleton width={140} height={18} />
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
            <Skeleton width={90} height={20} radius={999} />
            <Skeleton width={50} height={16} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <Skeleton height={18} width="85%" />
          <Skeleton height={14} width="100%" />
          <Skeleton height={14} width="92%" />
        </div>
        <div className="signal-foot" style={{ marginTop: 18 }}>
          <Skeleton width={120} height={22} radius={999} />
          <Skeleton width={90} height={14} />
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
            <Skeleton width={26} height={26} radius={6} />
            <span className="rail-src-meta" style={{ flex: 1, gap: 6 }}>
              <Skeleton height={12} width="85%" />
              <Skeleton height={10} width="60%" />
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
        <Skeleton height={32} width={40} />
        <Skeleton height={14} width={140} />
      </div>
    </section>
  );
}
