"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtCompact } from "@/lib/format";

/**
 * Hand-rolled SVG line chart (Competitor Hub follower-growth graph).
 *
 * No chart dependency on purpose: the needs are one series + hover, and a
 * custom SVG matches the editorial design tokens exactly (serif numbers,
 * mono axis labels, calm-blue accent) at ~0KB of added bundle.
 *
 * Interaction: pointermove finds the nearest point on the x axis, renders a
 * vertical guide + dot, and positions a tooltip div. Touch works through the
 * same pointer events.
 */
export interface LinePoint {
  /** ISO date (yyyy-mm-dd) used for the x axis. */
  date: string;
  value: number;
}

const M = { top: 14, right: 14, bottom: 26, left: 48 };
const HEIGHT = 220;

function shortDate(d: string): string {
  const date = new Date(d + "T00:00:00Z");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function LineChart({
  points,
  formatValue = fmtCompact,
  ariaLabel = "Trend chart",
}: {
  points: LinePoint[];
  formatValue?: (n: number) => string;
  ariaLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    if (width === 0 || points.length < 2) return null;
    const innerW = width - M.left - M.right;
    const innerH = HEIGHT - M.top - M.bottom;
    const values = points.map((p) => p.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const x = (i: number) => M.left + (i / (points.length - 1)) * innerW;
    const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo)) * innerH;
    const coords = points.map((p, i) => ({ cx: x(i), cy: y(p.value) }));
    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");
    const area = `${path} L${coords[coords.length - 1].cx.toFixed(1)},${M.top + innerH} L${coords[0].cx.toFixed(1)},${M.top + innerH} Z`;
    // 3 horizontal gridlines: bottom / mid / top of the padded domain.
    const grid = [lo, (lo + hi) / 2, hi].map((v) => ({ v, gy: y(v) }));
    return { coords, path, area, grid, innerH };
  }, [width, points]);

  if (points.length < 2) {
    return (
      <div className="chart-empty">
        Not enough history yet — the line appears after the second daily snapshot.
      </div>
    );
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    geom.coords.forEach((c, i) => {
      const d = Math.abs(c.cx - px);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHover(best);
  }

  const h = hover !== null && geom ? { p: points[hover], c: geom.coords[hover] } : null;
  // Keep the tooltip inside the chart on both edges.
  const tipLeft = h ? Math.min(Math.max(h.c.cx, 70), Math.max(width - 70, 70)) : 0;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {geom && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {geom.grid.map((g, i) => (
            <g key={i}>
              <line x1={M.left} x2={width - M.right} y1={g.gy} y2={g.gy}
                stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={g.gy + 3} textAnchor="end" className="chart-axis">
                {formatValue(Math.round(g.v))}
              </text>
            </g>
          ))}
          <path d={geom.area} fill="var(--accent)" opacity={0.07} />
          <path d={geom.path} fill="none" stroke="var(--accent)" strokeWidth={1.8}
            strokeLinejoin="round" strokeLinecap="round" />
          {/* First / middle / last x labels. */}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((i) => (
              <text key={i} x={geom.coords[i].cx} y={HEIGHT - 8} textAnchor="middle" className="chart-axis">
                {shortDate(points[i].date)}
              </text>
            ))}
          {h && (
            <g>
              <line x1={h.c.cx} x2={h.c.cx} y1={M.top} y2={HEIGHT - M.bottom}
                stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={h.c.cx} cy={h.c.cy} r={4.5} fill="var(--accent)" stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {h && (
        <div className="chart-tip" style={{ left: tipLeft, top: Math.max(h.c.cy - 14, 8) }}>
          <span className="chart-tip-val">{h.p.value.toLocaleString()}</span>
          <span className="chart-tip-date">{shortDate(h.p.date)}</span>
        </div>
      )}
    </div>
  );
}
