/* Loading skeleton for /admin overview (and a fallback for any admin child
   route that doesn't have its own loading.tsx). */
export default function AdminLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={pulse({ height: 30, width: 180 })} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={pulse({ height: 92 })} />
        ))}
      </div>
      <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={pulse({ height: 16, width: 200 })} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={pulse({ height: 32 })} />
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
