"use client";

import type { SourceItem } from "@/lib/types";
import { Icon } from "@/components/icons/Icon";
import { Favicon } from "./Favicon";

/* Clickable, credibility-forward source chip (components.jsx SourceButton). */
export function SourceButton({ s }: { s: SourceItem }) {
  return (
    <a
      className="source"
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (s.url === "#") e.preventDefault();
      }}
    >
      <Favicon s={s} />
      <span className="src-meta">
        <span className="src-name">{s.name}</span>
        <span className="src-time">{s.kind} · {s.time}</span>
      </span>
      <span className="ext"><Icon name="ArrowUpRight01Icon" size={15} stroke={1.8} /></span>
    </a>
  );
}

export default SourceButton;
