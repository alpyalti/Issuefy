"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtCompact } from "@/lib/format";

/**
 * Hand-rolled SVG bar chart (Competitor Hub — engagement per post).
 * Hover shows a tooltip with per-bar breakdown lines; click opens the post.
 */
export interface Bar {
  label: string;          // x label (short date)
  value: number;          // bar height (likes + comments)
  tooltip: string[];      // breakdown lines shown on hover
  href?: string;          // post URL — click-through
}

const M = { top: 14, right: 10, bottom: 26, left: 44 };
const HEIGHT = 190;

export function BarChart({ bars, ariaLabel = "Bar chart" }: { bars: Bar[]; ariaLabel?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.round(entries[0]?.contentRect.width ?? 0));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    if (width === 0 || bars.length === 0) return null;
    const innerW = width - M.left - M.right;
    const innerH = HEIGHT - M.top - M.bottom;
    const hi = Math.max(...bars.map((b) => b.value), 1);
    const slot = innerW / bars.length;
    const barW = Math.max(6, Math.min(34, slot * 0.55));
    const rects = bars.map((b, i) => {
      const h = (b.value / hi) * innerH;
      return {
        x: M.left + slot * i + (slot - barW) / 2,
        y: M.top + innerH - h,
        w: barW,
        h: Math.max(h, b.value > 0 ? 2 : 0),
      };
    });
    const grid = [0, hi / 2, hi].map((v) => ({ v, gy: M.top + innerH - (v / hi) * innerH }));
    return { rects, grid, innerH, slot };
  }, [width, bars]);

  if (bars.length === 0) {
    return <div className="chart-empty">No posts captured yet.</div>;
  }

  const h = hover !== null && geom ? { b: bars[hover], r: geom.rects[hover] } : null;
  const tipLeft = h ? Math.min(Math.max(h.r.x + h.r.w / 2, 80), Math.max(width - 80, 80)) : 0;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {geom && (
        <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel}
          onPointerLeave={() => setHover(null)}>
          {geom.grid.map((g, i) => (
            <g key={i}>
              <line x1={M.left} x2={width - M.right} y1={g.gy} y2={g.gy} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={g.gy + 3} textAnchor="end" className="chart-axis">
                {fmtCompact(Math.round(g.v))}
              </text>
            </g>
          ))}
          {geom.rects.map((r, i) => (
            <g key={i}>
              {/* Invisible full-height hit area so thin bars are easy to hover. */}
              <rect
                x={M.left + geom.slot * i} y={M.top} width={geom.slot} height={geom.innerH}
                fill="transparent"
                style={{ cursor: bars[i].href ? "pointer" : "default" }}
                onPointerEnter={() => setHover(i)}
                onClick={() => { if (bars[i].href) window.open(bars[i].href, "_blank", "noopener"); }}
              />
              <rect
                x={r.x} y={r.y} width={r.w} height={r.h} rx={3}
                fill="var(--accent)"
                opacity={hover === null || hover === i ? 0.85 : 0.3}
                style={{ pointerEvents: "none", transition: "opacity .12s" }}
              />
            </g>
          ))}
          {bars.length <= 14 && bars.map((b, i) => (
            <text key={i} x={geom.rects[i].x + geom.rects[i].w / 2} y={HEIGHT - 8}
              textAnchor="middle" className="chart-axis">
              {b.label}
            </text>
          ))}
        </svg>
      )}
      {h && (
        <div className="chart-tip" style={{ left: tipLeft, top: Math.max(h.r.y - 12, 8) }}>
          {h.b.tooltip.map((line, i) => (
            <span key={i} className={i === 0 ? "chart-tip-val" : "chart-tip-date"}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
