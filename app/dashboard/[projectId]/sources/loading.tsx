/* Skeleton for the sources page — instant feedback while the SQL pulls
   the 200 most recent rows. */
export default function SourcesLoading() {
  return (
    <div className="page-wrap">
      <div className="sources-summary" style={{ opacity: 0.7 }}>
        <div className="ss-stat"><span className="ss-num">—</span><span className="ss-lab">sources tracked</span></div>
        <div className="ss-divider" />
        <div className="ss-stat"><span className="ss-num">—</span><span className="ss-lab">source types</span></div>
        <div className="ss-divider" />
        <div className="ss-stat"><span className="ss-num">—</span><span className="ss-lab">links to verify</span></div>
      </div>
      <div className="source-pubs">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="source-pub" key={i}>
            <div className="source-pub-head">
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" }} />
              <span className="source-pub-meta" style={{ gap: 6 }}>
                <span style={{ height: 14, width: 120, borderRadius: 6, background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" }} />
                <span style={{ height: 10, width: 80, borderRadius: 6, background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" }} />
              </span>
            </div>
            <div className="source-pub-links">
              {Array.from({ length: 3 }).map((__, j) => (
                <div className="source-link" key={j} style={{ pointerEvents: "none" }}>
                  <span className="source-link-dot" />
                  <span style={{ flex: 1, height: 12, borderRadius: 6, background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
