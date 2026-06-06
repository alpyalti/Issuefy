/* Loading skeleton for /admin/users — table-style placeholder. */
export default function AdminUsersLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={pulse({ height: 30, width: 140 })} />
      <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 80px", gap: 12, padding: "10px 6px" }}>
            <div style={pulse({ height: 14 })} />
            <div style={pulse({ height: 14, width: "80%" })} />
            <div style={pulse({ height: 14 })} />
            <div style={pulse({ height: 14 })} />
          </div>
        ))}
      </section>
    </div>
  );
}

function pulse(style: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
    borderRadius: 6,
    ...style,
  };
}
