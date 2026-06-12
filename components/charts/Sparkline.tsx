"use client";

/**
 * Tiny inline trend line for platform cards. Pure SVG, no interaction.
 * Falls back to a flat dash when there's only one data point.
 */
export function Sparkline({
  values,
  width = 84,
  height = 26,
  stroke = "var(--accent)",
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1={2} x2={width - 2} y1={height / 2} y2={height / 2}
          stroke="var(--line-2)" strokeWidth={1.4} strokeDasharray="3 3" />
      </svg>
    );
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (height - pad * 2) - ((v - lo) / (hi - lo)) * (height - pad * 2);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke={up ? stroke : "var(--neg)"} strokeWidth={1.6}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
