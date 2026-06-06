/* Loading skeleton for /dashboard/[projectId]/account. */
export default function AccountLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SkeletonCard title="Identity" rows={3} />
      <SkeletonCard title="Plan" rows={2} />
      <SkeletonCard title="Email preferences" rows={1} />
      <SkeletonCard title="Security" rows={1} />
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

function SkeletonCard({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink-3)" }}>{title}</h2>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={pulse({ height: 36, width: i === 0 ? "70%" : "100%" })} />
      ))}
    </section>
  );
}
