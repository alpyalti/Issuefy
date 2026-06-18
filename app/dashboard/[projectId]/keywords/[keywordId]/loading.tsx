import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/Skeleton";

/* Loading skeleton for the keyword hub — header + stats + trend + leads. */
export default function KeywordHubLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Skeleton width={52} height={52} radius={14} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <Skeleton height={26} width={200} />
          <Skeleton height={13} width={240} />
        </div>
        <Skeleton height={38} width={150} radius={10} />
      </header>
      <SkeletonStats count={4} height={88} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <SkeletonCard gap={14}><Skeleton height={18} width={200} /><Skeleton height={220} radius={10} /></SkeletonCard>
          <SkeletonCard rows={3} rowHeight={120} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SkeletonCard rows={4} rowHeight={20} />
          <SkeletonCard rows={4} rowHeight={38} />
        </div>
      </div>
    </div>
  );
}
