import * as React from "react";
import { ICONS, type IconName } from "./registry";

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

type IconNode = readonly [string, Record<string, unknown>];

/**
 * Renders a Hugeicon by name. Mirrors the design prototype's svgFor():
 * 24x24 viewBox, fill none, stroke=currentColor, round caps/joins. The wrapper
 * <span class="ic-wrap"> preserves the prototype's CSS hooks (e.g. `.side-item.on
 * .ic-wrap`, `.spin`, `.dd-chev`), so className is applied to the wrapper.
 */
export function Icon({
  name,
  size = 20,
  stroke = 1.6,
  color = "currentColor",
  className = "",
  style,
  title,
}: IconProps) {
  const nodes = ICONS[name] as unknown as ReadonlyArray<IconNode> | undefined;
  return (
    <span className={("ic-wrap " + className).trim()} style={{ display: "inline-flex", lineHeight: 0, ...style }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hgi"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
      >
        {title ? <title>{title}</title> : null}
        {nodes
          ? nodes.map(([tag, attrs], i) => {
              const { key: _key, ...rest } = attrs;
              return React.createElement(tag, { ...rest, key: i });
            })
          : <rect x="4" y="4" width="16" height="16" rx="3" />}
      </svg>
    </span>
  );
}

export default Icon;
