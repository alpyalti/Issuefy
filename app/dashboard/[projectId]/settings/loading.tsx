import { SkeletonCard, Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for /dashboard/[projectId]/settings. Mirrors the section
   stack the live page renders so the layout doesn't pop. */
export default function SettingsLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <SkeletonCard title="Plan usage" gap={12}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={64} radius={10} />
          ))}
        </div>
      </SkeletonCard>
      <SkeletonCard title="Project details" rows={5} />
      <SkeletonCard title="Your company" rows={4} />
      <SkeletonCard title="Competitors" rows={4} rowHeight={48} />
      <SkeletonCard title="Keywords" rows={4} rowHeight={42} />
    </div>
  );
}
