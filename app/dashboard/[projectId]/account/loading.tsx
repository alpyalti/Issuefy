import { SkeletonCard } from "@/components/ui/Skeleton";

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
