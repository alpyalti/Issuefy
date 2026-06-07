import type { CSSProperties, ReactNode } from "react";

/**
 * Skeleton primitives shared by every loading.tsx in the app.
 *
 * Why this exists:
 *   Each loading.tsx used to copy-paste its own `pulse()` helper plus a
 *   lookalike SkeletonCard/SkeletonRow/SkeletonTable. They drifted over time
 *   (one had no animation at all; another wrote out the shimmer style strings
 *   inline) and the maintenance cost was real. Centralizing makes a tweak
 *   to the shimmer rhythm or color a one-line change.
 *
 * Animation: relies on the global `@keyframes shimmer` defined in
 * app/globals.css (and again in app/dashboard.css — historical, harmless).
 */

const SHIMMER_BG = "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))";
const SHIMMER_ANIM = "shimmer 1.4s ease-in-out infinite";

const baseStyle: CSSProperties = {
  background: SHIMMER_BG,
  backgroundSize: "200% 100%",
  animation: SHIMMER_ANIM,
  borderRadius: 6,
  display: "block",
};

/**
 * Bare shimmer rectangle. Pass width/height as number (px) or any CSS string,
 * plus any extra style overrides. Use this as the atomic building block of
 * everything below.
 */
export function Skeleton({
  width,
  height,
  radius,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        ...baseStyle,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(radius !== undefined ? { borderRadius: radius } : {}),
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/** Multi-line text block with descending widths so it reads as a paragraph. */
export function SkeletonText({
  lines = 3,
  widths = ["100%", "92%", "78%"],
  height = 14,
  gap = 8,
}: {
  lines?: number;
  /** Per-line width values, looped if shorter than `lines`. */
  widths?: Array<number | string>;
  height?: number;
  gap?: number;
}) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={height} width={widths[i % widths.length]} />
      ))}
    </span>
  );
}

/** Standard card-shaped skeleton with title + N row placeholders. */
export function SkeletonCard({
  title,
  rows = 4,
  rowHeight = 36,
  padding = 22,
  gap = 12,
  children,
}: {
  title?: string;
  rows?: number;
  rowHeight?: number;
  padding?: number;
  gap?: number;
  /** Replace the auto-generated rows with custom skeleton content. */
  children?: ReactNode;
}) {
  return (
    <section className="card" style={{ padding, display: "flex", flexDirection: "column", gap }}>
      {title && (
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink-3)" }}>{title}</h2>
      )}
      {children ?? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: title ? 6 : 0 }}>
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} height={rowHeight} width={i === 0 ? "70%" : "100%"} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Table-style skeleton. Renders `rows` × `cols` cells in a CSS grid. */
export function SkeletonTable({
  rows = 10,
  cols = 4,
  columnWidths,
  rowGap = 8,
  cellHeight = 14,
  rowPadding = "10px 6px",
}: {
  rows?: number;
  cols?: number;
  /** Override grid-template-columns. Default = equal 1fr columns. */
  columnWidths?: string;
  rowGap?: number;
  cellHeight?: number;
  rowPadding?: string;
}) {
  const gridTemplateColumns = columnWidths ?? `repeat(${cols}, 1fr)`;
  return (
    <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: rowGap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns, gap: 12, padding: rowPadding }}>
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} height={cellHeight} width={j === cols - 1 ? "60%" : undefined} />
          ))}
        </div>
      ))}
    </section>
  );
}

/** Stats strip — N pill placeholders for KPIs / counters. */
export function SkeletonStats({ count = 4, height = 92 }: { count?: number; height?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} radius={12} />
      ))}
    </div>
  );
}

/** Page header — title + optional action button on the right. */
export function SkeletonPageHeader({
  titleWidth = 220,
  subtitleWidth = 360,
  actionWidth = 140,
  hasAction = false,
  hasSubtitle = false,
}: {
  titleWidth?: number | string;
  subtitleWidth?: number | string;
  actionWidth?: number | string;
  hasAction?: boolean;
  hasSubtitle?: boolean;
}) {
  return (
    <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
        <Skeleton height={32} width={titleWidth} />
        {hasSubtitle && <Skeleton height={14} width={subtitleWidth} />}
      </div>
      {hasAction && <Skeleton height={38} width={actionWidth} radius={10} />}
    </header>
  );
}
