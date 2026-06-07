import { Skeleton } from "@/components/ui/Skeleton";

/* Skeleton for /dashboard/[projectId]/sources — instant feedback while the
   SQL pulls the 200 most recent rows. Mirrors the live page's 4 publication
   cards × N source-link rows layout. */
export default function SourcesLoading() {
  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
              <Skeleton width={34} height={34} radius={9} />
              <span className="source-pub-meta" style={{ gap: 6 }}>
                <Skeleton height={14} width={120} />
                <Skeleton height={10} width={80} />
              </span>
            </div>
            <div className="source-pub-links">
              {Array.from({ length: 3 }).map((__, j) => (
                <div className="source-link" key={j} style={{ pointerEvents: "none" }}>
                  <span className="source-link-dot" />
                  <Skeleton height={12} style={{ flex: 1 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
