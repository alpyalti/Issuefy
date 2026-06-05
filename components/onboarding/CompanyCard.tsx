"use client";

import { Icon } from "@/components/icons/Icon";
import type { CompanyData } from "./enrich";

/* Detected company card with editable social accounts (modals.jsx CompanyCard).
   Serves as the seed for WebsiteEnrichmentForm / SocialLinksEditor in later phases. */
export function CompanyCard({
  data,
  onChange,
  onRemove,
  compact,
}: {
  data: CompanyData;
  onChange: (d: CompanyData) => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  function toggle(i: number) {
    const s = data.socials.map((x, j) => (j === i ? { ...x, on: !x.on } : x));
    onChange({ ...data, socials: s });
  }
  function edit(i: number, v: string) {
    const s = data.socials.map((x, j) => (j === i ? { ...x, value: v } : x));
    onChange({ ...data, socials: s });
  }
  return (
    <div className={"co-card " + (compact ? "compact" : "")}>
      <div className="co-head">
        <span className="co-logo" style={{ background: data.color }}>{data.initials}</span>
        <span className="co-meta">
          <span className="co-name">{data.name}</span>
          <span className="co-domain">{data.domain}{data.tagline ? " · " + data.tagline : ""}</span>
        </span>
        {onRemove && (
          <button className="co-remove" onClick={onRemove} aria-label="Remove">
            <Icon name="Delete02Icon" size={16} stroke={1.7} />
          </button>
        )}
      </div>
      <div className="co-socials">
        {data.socials.map((s, i) => (
          <div className={"co-social " + (s.on ? "on" : "off")} key={i}>
            <span className="co-social-ic"><Icon name={s.icon} size={15} stroke={1.7} /></span>
            <span className="co-social-kind">{s.kind}</span>
            <input className="co-social-val" value={s.value} onChange={(e) => edit(i, e.target.value)} spellCheck={false} />
            <button className="co-social-toggle" onClick={() => toggle(i)} title={s.on ? "Tracking" : "Off"}>
              <Icon name={s.on ? "CheckmarkBadge01Icon" : "Add01Icon"} size={16} stroke={1.7} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CompanyCard;
