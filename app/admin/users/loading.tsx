import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

/* Loading skeleton for /admin/users — table-style placeholder. */
export default function AdminUsersLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Skeleton height={30} width={140} />
      <SkeletonTable rows={12} columnWidths="1fr 1fr 80px 80px" cellHeight={14} />
    </div>
  );
}
