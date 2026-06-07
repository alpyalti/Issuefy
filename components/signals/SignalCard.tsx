"use client";

import { useState } from "react";
import type { SignalItem } from "@/lib/types";
import { CAT, SEV, fmtAge } from "@/lib/types";
import { Icon } from "@/components/icons/Icon";
import { SourceButton } from "./SourceButton";
import { SourceStack } from "./SourceStack";

/**
 * Signal card.
 *
 * Now surfaces:
 *   - the AI's suggested_action as a calm-blue block under the context
 *     (with a "mark done" toggle that strikes through when complete)
 *   - a collapsible "Note" expander for the user's private annotation
 *
 * Both wire to PATCH /api/signals/:id with optimistic updates handled by
 * the parent. The card receives note + actionDone via the sig prop.
 */
export function SignalCard({
  sig,
  saved,
  leaving,
  onSave,
  onDismiss,
  onNoteChange,
  onActionDoneToggle,
  companySet,
  readOnly = false,
}: {
  sig: SignalItem;
  saved: boolean;
  leaving: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onNoteChange?: (next: string) => void;
  onActionDoneToggle?: (next: boolean) => void;
  companySet: Set<string>;
  /** Viewer mode (Teams Phase 5). Disables every action button with a
   *  tooltip. The card still shows the signal in full so viewers see
   *  exactly what their team is seeing. */
  readOnly?: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(sig.userNote ?? "");
  const cat = CAT[sig.category];
  const _sev = SEV[sig.severity];
  void _sev;

  const sortedTags = [...sig.tags].sort(
    (a, b) => (companySet.has(b) ? 1 : 0) - (companySet.has(a) ? 1 : 0),
  );

  function saveNote() {
    if (onNoteChange) onNoteChange(noteDraft.trim());
    setNoteOpen(false);
  }

  return (
    <article
      id={`sig-${sig.id}`}
      className={"signal " + (sig.isNew ? "is-new " : "") + (leaving ? "leaving" : "")}
    >
      <div className="signal-rail">
        <span className={"sev-bar cat-" + sig.category} />
      </div>
      <div className="signal-body">
        <header className="signal-top">
          <div className="signal-tags">
            <span className={"pill " + cat.pill}><span className="dot" />{cat.label}</span>
            {sig.severity === "high" && (
              <span
                className="sev-flag sev-high"
                title="Flagged · high importance"
              >
                <Icon name="Flag02Icon" size={13} stroke={2} />
              </span>
            )}
            {sig.isNew && <span className="new-dot">New</span>}
            {sig.userNote && (
              <span className="signal-note-flag" title="You have a note on this signal">
                <Icon name="Bookmark01Icon" size={12} stroke={2} />
              </span>
            )}
            <span className="signal-age">{fmtAge(sig.hoursAgo)}</span>
          </div>
          <div className="signal-actions">
            <button
              className="icon-btn"
              title={readOnly ? "Viewers can't add notes" : "Add note"}
              aria-label={sig.userNote ? "Edit note" : "Add note"}
              onClick={() => setNoteOpen((o) => !o)}
              disabled={readOnly}
            >
              <Icon name="NoteAddIcon" size={16} stroke={sig.userNote ? 2 : 1.6} />
            </button>
            <button
              className={"icon-btn " + (saved ? "on" : "")}
              title={readOnly ? "Viewers can't save signals" : (saved ? "Saved" : "Save")}
              onClick={onSave}
              disabled={readOnly}
            >
              <Icon name="Bookmark01Icon" size={17} stroke={saved ? 2 : 1.6} />
            </button>
            <button
              className="icon-btn"
              title={readOnly ? "Viewers can't dismiss signals" : "Dismiss"}
              onClick={onDismiss}
              disabled={readOnly}
            >
              <Icon name="Cancel01Icon" size={16} stroke={1.7} />
            </button>
          </div>
        </header>

        <p className="signal-take">{sig.title}</p>
        <p className="signal-context">{sig.context}</p>

        {sig.suggestedAction && (
          <div className={"signal-action " + (sig.actionDone ? "is-done" : "")}>
            <div className="signal-action-head">
              <Icon name="BulbIcon" size={13} stroke={1.8} color={sig.actionDone ? "var(--ink-4)" : "var(--accent-ink)"} />
              <span>Suggested action</span>
              {onActionDoneToggle && !readOnly && (
                <button
                  className="signal-action-toggle"
                  onClick={() => onActionDoneToggle(!sig.actionDone)}
                  title={sig.actionDone ? "Mark as not done" : "Mark as done"}
                  aria-pressed={sig.actionDone}
                >
                  <Icon name={sig.actionDone ? "CheckmarkBadge01Icon" : "Tick02Icon"} size={14} stroke={1.8} />
                  {sig.actionDone ? "Done" : "Mark done"}
                </button>
              )}
            </div>
            <p className="signal-action-text">{sig.suggestedAction}</p>
          </div>
        )}

        {noteOpen && (
          <div className="signal-note-editor">
            <textarea
              className="signal-note-input"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a personal note — anything you want to remember about this signal."
              autoFocus
              rows={3}
            />
            <div className="signal-note-actions">
              <button className="btn btn-quiet btn-sm" onClick={() => { setNoteDraft(sig.userNote ?? ""); setNoteOpen(false); }}>Cancel</button>
              <button className="btn btn-accent btn-sm" onClick={saveNote}>Save note</button>
            </div>
          </div>
        )}
        {!noteOpen && sig.userNote && (
          <div className="signal-note-display" onClick={() => setNoteOpen(true)} role="button" tabIndex={0}>
            <Icon name="Bookmark01Icon" size={12} stroke={1.7} color="var(--ink-3)" />
            <span>{sig.userNote}</span>
          </div>
        )}

        <div className="signal-meta">
          {sortedTags.map((t, i) => (
            <span className={"tag " + (companySet.has(t) ? "tag-co" : "")} key={i}>{t}</span>
          ))}
        </div>

        <footer className="signal-foot">
          <button className="srcbtn" onClick={() => setSourcesOpen((o) => !o)}>
            <SourceStack sources={sig.sources} />
            <span className="srcbtn-label">{sig.sources.length} sources</span>
            <Icon name={sourcesOpen ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={15} stroke={1.8} />
          </button>
          <span className="verified"><Icon name="CheckmarkBadge01Icon" size={15} stroke={1.7} /> Cross-verified</span>
        </footer>

        {sourcesOpen && (
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
