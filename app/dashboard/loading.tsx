/* Skeleton for the /dashboard project-list / first-project-redirect page.
   Brief flash; usually the redirect to /dashboard/[id] fires before this
   even shows. Kept for the multi-project case + cold cache. */
export default function DashboardIndexLoading() {
  return (
    <div className="page-wrap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 30 }}>
        <span style={{ width: 200, height: 30, borderRadius: 6, background: "var(--surface-2)" }} />
        <span style={{ width: 140, height: 38, borderRadius: 10, background: "var(--surface-2)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 22, minHeight: 120, background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" }} />
        ))}
      </div>
    </div>
  );
}
