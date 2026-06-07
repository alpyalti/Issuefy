import { Skeleton, SkeletonPageHeader } from "@/components/ui/Skeleton";

/* Skeleton for the /dashboard (All Projects) listing page. Brief flash; on
   single-project accounts the server redirect to /dashboard/[id] fires
   before this even mounts. Kept for the multi-project case + cold cache. */
export default function DashboardIndexLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <SkeletonPageHeader titleWidth={200} hasSubtitle subtitleWidth={280} hasAction />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <section key={i} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10, minHeight: 120 }}>
            <Skeleton height={22} width="70%" />
            <Skeleton height={13} width="55%" />
            <Skeleton height={11} width={120} style={{ marginTop: "auto" }} />
          </section>
        ))}
      </div>
    </div>
  );
}
