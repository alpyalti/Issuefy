import { Skeleton } from "@/components/ui/Skeleton";

/* Loading skeleton for /invite/[token] — centered acceptance card with the
   project name + role + accept/decline actions. */
export default function InviteLoading() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="card" style={{ padding: 32, width: "min(440px, 100%)", display: "flex", flexDirection: "column", gap: 18 }}>
        <Skeleton height={14} width={120} />
        <Skeleton height={28} width="80%" />
        <Skeleton height={14} width="100%" />
        <Skeleton height={14} width="92%" />
        <Skeleton height={14} width="60%" />
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <Skeleton height={44} width={140} radius={10} />
          <Skeleton height={44} width={140} radius={10} />
        </div>
      </section>
    </div>
  );
}
