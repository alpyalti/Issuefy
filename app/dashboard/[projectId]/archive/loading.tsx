import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

/* Loading skeleton for /dashboard/[projectId]/archive — list of past daily
   briefs (date + word count + signal count per row). */
export default function ArchiveLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SkeletonPageHeader titleWidth={160} hasSubtitle subtitleWidth={280} />
      <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px 80px", gap: 16, padding: "12px 10px", alignItems: "center" }}>
            <Skeleton height={14} width={100} />
            <Skeleton height={14} width="85%" />
            <Skeleton height={14} width={60} />
            <Skeleton height={14} width={50} />
          </div>
        ))}
      </section>
    </div>
  );
}
