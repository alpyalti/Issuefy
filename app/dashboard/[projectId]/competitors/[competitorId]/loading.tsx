import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/Skeleton";

/* Loading skeleton for the Competitor Hub — header + stats + chart blocks +
   posts grid + rail, mirroring the live layout so nothing pops. */
export default function CompetitorHubLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Skeleton width={52} height={52} radius={14} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <Skeleton height={26} width={220} />
          <Skeleton height={13} width={320} />
        </div>
        <Skeleton height={38} width={150} radius={10} />
      </header>
      <SkeletonStats count={4} height={96} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <SkeletonCard gap={14}>
            <Skeleton height={18} width={180} />
            <Skeleton height={220} radius={10} />
            <Skeleton height={150} radius={10} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={200} radius={12} />
              ))}
            </div>
          </SkeletonCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SkeletonCard rows={2} rowHeight={48} />
          <SkeletonCard rows={3} rowHeight={42} />
          <SkeletonCard rows={4} rowHeight={38} />
        </div>
      </div>
    </div>
  );
}
