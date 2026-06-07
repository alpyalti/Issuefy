import { Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for /admin/support/[id] — single-ticket detail in the
   admin queue. Mirrors a user-side ticket thread, plus an admin actions
   strip and a reply form. */
export default function AdminTicketDetailLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton height={14} width={120} />
        <Skeleton height={30} width="60%" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Skeleton height={22} width={80} radius={999} />
          <Skeleton height={22} width={120} radius={999} />
          <Skeleton height={22} width={160} radius={999} />
        </div>
      </header>
      <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Skeleton width={28} height={28} radius={999} />
              <Skeleton height={14} width={150} />
            </div>
            <Skeleton height={14} width="100%" />
            <Skeleton height={14} width="92%" />
            <Skeleton height={14} width="68%" />
          </div>
        ))}
      </section>
      <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton height={16} width={140} />
        <Skeleton height={120} radius={10} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Skeleton height={38} width={130} radius={10} />
          <Skeleton height={38} width={130} radius={10} />
        </div>
      </section>
    </div>
  );
}
