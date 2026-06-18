import { Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for the central Leads inbox. */
export default function LeadsLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={26} width={120} />
        <Skeleton height={14} width={340} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={32} width={140} radius={10} />)}
      </div>
      <div className="leads-grid">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={180} radius={13} />)}
      </div>
    </div>
  );
}
