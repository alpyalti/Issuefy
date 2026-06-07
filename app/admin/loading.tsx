import { Skeleton, SkeletonStats, SkeletonCard } from "@/components/ui/Skeleton";

/* Loading skeleton for /admin overview. Also serves as a fallback for any
   admin child route that doesn't have its own loading.tsx. */
export default function AdminLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Skeleton height={30} width={180} />
      <SkeletonStats count={4} height={92} />
      <SkeletonCard rows={6} rowHeight={32}>
        <Skeleton height={16} width={200} style={{ marginBottom: 8 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={32} />
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
