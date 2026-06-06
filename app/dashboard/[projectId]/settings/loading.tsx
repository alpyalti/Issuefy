/* Loading skeleton for /dashboard/[projectId]/settings. Streams in via
   Next's loading.tsx convention so the user gets instant feedback after
   clicking instead of a blank page. */
export default function SettingsLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <SkeletonCard rows={4} title="Plan usage" />
      <SkeletonCard rows={5} title="Project details" />
      <SkeletonCard rows={4} title="Your company" />
      <SkeletonCard rows={4} title="Competitors" />
      <SkeletonCard rows={4} title="Keywords" />
    </div>
  );
}

function pulse(style: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
    borderRadius: 6,
    ...style,
  };
}

function SkeletonCard({ rows, title }: { rows: number; title: string }) {
  return (
    <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink-3)" }}>{title}</h2>
        <span style={pulse({ width: 60, height: 12 })} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={pulse({ height: 42, width: "100%" })} />
        ))}
      </div>
    </section>
  );
}
