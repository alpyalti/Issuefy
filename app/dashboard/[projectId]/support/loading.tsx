/* Loading skeleton for /dashboard/[projectId]/support — mirrors the
   2-column form-left + email/FAQ-right layout used on the live page. */
export default function SupportLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={pulse({ height: 36, width: 220 })} />
        <div style={pulse({ height: 14, width: 360 })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 24 }}>
        <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={pulse({ height: 16, width: 140 })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
            <div style={pulse({ height: 46 })} />
            <div style={pulse({ height: 46 })} />
          </div>
          <div style={pulse({ height: 160 })} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={pulse({ width: 140, height: 38 })} />
          </div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="card" style={{ padding: 22 }}>
            <div style={pulse({ height: 80 })} />
          </section>
          <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={pulse({ height: 16, width: 180 })} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={pulse({ height: 38 })} />
            ))}
          </section>
        </div>
      </div>
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
