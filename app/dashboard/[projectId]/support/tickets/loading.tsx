import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

/* Loading skeleton for /dashboard/[projectId]/support/tickets — the user's
   ticket history list. Each row = subject + status chip + updated-at. */
export default function SupportTicketsLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SkeletonPageHeader titleWidth={180} hasSubtitle subtitleWidth={300} />
      <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px", gap: 14, padding: "12px 10px", alignItems: "center" }}>
            <Skeleton height={14} width={`${60 + ((i * 13) % 30)}%`} />
            <Skeleton height={22} radius={999} />
            <Skeleton height={12} width={90} />
          </div>
        ))}
      </section>
    </div>
  );
}
