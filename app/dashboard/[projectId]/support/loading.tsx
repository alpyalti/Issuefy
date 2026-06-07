import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/* Loading skeleton for /dashboard/[projectId]/support — mirrors the
   2-column form-left + email/FAQ-right layout used on the live page. */
export default function SupportLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={36} width={220} />
        <Skeleton height={14} width={360} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 24 }}>
        <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton height={16} width={140} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
            <Skeleton height={46} radius={10} />
            <Skeleton height={46} radius={10} />
          </div>
          <Skeleton height={160} radius={10} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Skeleton height={38} width={140} radius={10} />
          </div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="card" style={{ padding: 22 }}>
            <Skeleton height={80} />
          </section>
          <SkeletonCard rows={5} rowHeight={36}>
            <Skeleton height={16} width={180} style={{ marginBottom: 6 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} height={38} />
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
