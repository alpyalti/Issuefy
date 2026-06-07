import { Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for /admin/support — ticket queue placeholder.
   Pill row at the top = status filter chips on the live page. */
export default function AdminSupportLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Skeleton height={30} width={200} />
      <section className="card" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={30} width={84} radius={999} />
        ))}
      </section>
      <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} height={56} />
        ))}
      </section>
    </div>
  );
}
