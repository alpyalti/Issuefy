import { Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for /dashboard/[projectId]/support/tickets/[id] — single
   ticket thread (header + message bubbles + reply form). */
export default function SupportTicketDetailLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton height={14} width={120} />
        <Skeleton height={30} width="65%" />
        <div style={{ display: "flex", gap: 10 }}>
          <Skeleton height={22} width={80} radius={999} />
          <Skeleton height={22} width={110} radius={999} />
        </div>
      </header>
      <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Skeleton width={28} height={28} radius={999} />
              <Skeleton height={14} width={140} />
            </div>
            <Skeleton height={14} width="100%" />
            <Skeleton height={14} width="88%" />
            <Skeleton height={14} width="72%" />
          </div>
        ))}
      </section>
      <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton height={16} width={120} />
        <Skeleton height={120} radius={10} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Skeleton height={38} width={120} radius={10} />
        </div>
      </section>
    </div>
  );
}
