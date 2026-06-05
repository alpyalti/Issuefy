"use client";

import { useState } from "react";
import type { SignalItem } from "@/lib/types";
import { CAT, SEV, fmtAge } from "@/lib/types";
import { Icon } from "@/components/icons/Icon";
import { SourceButton } from "./SourceButton";
import { SourceStack } from "./SourceStack";

/* Signal card (components.jsx SignalCard). */
export function SignalCard({
  sig,
  saved,
  leaving,
  onSave,
  onDismiss,
  companySet,
}: {
  sig: SignalItem;
  saved: boolean;
  leaving: boolean;
  onSave: () => void;
  onDismiss: () => void;
  companySet: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const cat = CAT[sig.category];
  const _sev = SEV[sig.severity];
  void _sev;

  const sortedTags = [...sig.tags].sort(
    (a, b) => (companySet.has(b) ? 1 : 0) - (companySet.has(a) ? 1 : 0),
  );

  return (
    <article className={"signal " + (sig.isNew ? "is-new " : "") + (leaving ? "leaving" : "")}>
      <div className="signal-rail">
        <span className={"sev-bar cat-" + sig.category} />
      </div>
      <div className="signal-body">
        <header className="signal-top">
          <div className="signal-tags">
            <span className={"pill " + cat.pill}><span className="dot" />{cat.label}</span>
            {(sig.severity === "high" || sig.severity === "med") && (
              <span
                className={"sev-flag sev-" + sig.severity}
                title={sig.severity === "high" ? "Flagged · high importance" : "Worth a look"}
              >
                <Icon name="Flag02Icon" size={13} stroke={2} />
              </span>
            )}
            {sig.isNew && <span className="new-dot">New</span>}
            <span className="signal-age">{fmtAge(sig.hoursAgo)}</span>
          </div>
          <div className="signal-actions">
            <button className={"icon-btn " + (saved ? "on" : "")} title={saved ? "Saved" : "Save"} onClick={onSave}>
              <Icon name="Bookmark01Icon" size={17} stroke={saved ? 2 : 1.6} />
            </button>
            <button className="icon-btn" title="Dismiss" onClick={onDismiss}>
              <Icon name="Cancel01Icon" size={16} stroke={1.7} />
            </button>
          </div>
        </header>

        <p className="signal-take">{sig.title}</p>
        <p className="signal-context">{sig.context}</p>

        <div className="signal-meta">
          {sortedTags.map((t, i) => (
            <span className={"tag " + (companySet.has(t) ? "tag-co" : "")} key={i}>{t}</span>
          ))}
        </div>

        <footer className="signal-foot">
          <button className="srcbtn" onClick={() => setOpen((o) => !o)}>
            <SourceStack sources={sig.sources} />
            <span className="srcbtn-label">{sig.sources.length} sources</span>
            <Icon name={open ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={15} stroke={1.8} />
          </button>
          <span className="verified"><Icon name="CheckmarkBadge01Icon" size={15} stroke={1.7} /> Cross-verified</span>
        </footer>

        {open && (
          <div className="sources-open">
            <div className="sources-open-head">
              <Icon name="LinkSquare02Icon" size={14} stroke={1.7} />
              <span>Verify at the source</span>
            </div>
            <div className="sources-list">
              {sig.sources.map((s, i) => (
                <SourceButton key={i} s={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default SignalCard;
