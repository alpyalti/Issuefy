import { Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for /upgrade — plan picker (3-4 tier cards). */
export default function UpgradeLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
        <Skeleton height={40} width="80%" />
        <Skeleton height={14} width="100%" />
        <Skeleton height={14} width="60%" />
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, minHeight: 360 }}>
            <Skeleton height={18} width={100} />
            <Skeleton height={32} width={120} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={42} radius={10} style={{ marginTop: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} height={12} width={`${70 + ((j * 7) % 25)}%`} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
