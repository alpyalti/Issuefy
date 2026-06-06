/* Loading skeleton for /admin/support — ticket queue placeholder. */
export default function AdminSupportLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={pulse({ height: 30, width: 200 })} />
      <section className="card" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={pulse({ height: 30, width: 84, borderRadius: 999 })} />
        ))}
      </section>
      <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={pulse({ height: 56 })} />
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
