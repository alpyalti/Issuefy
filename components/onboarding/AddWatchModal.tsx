"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { WebsiteLookup } from "./WebsiteLookup";
import { CompanyCard } from "./CompanyCard";
import type { CompanyData } from "./enrich";

/* Add-to-watchlist modal (modals.jsx AddWatchModal): competitor = website-first,
   keyword = plain text. */
export function AddWatchModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (label: string, type: "Competitor" | "Keyword") => void;
}) {
  const [type, setType] = useState<"Competitor" | "Keyword">("Competitor");
  const [val, setVal] = useState("");
  const [found, setFound] = useState<CompanyData | null>(null);

  function submitKeyword() {
    const l = val.trim();
    if (!l) return;
    onAdd(l, "Keyword");
    onClose();
  }
  function confirmCompetitor() {
    if (!found) return;
    onAdd(found.name, "Competitor");
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Add to watchlist</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="Cancel01Icon" size={18} stroke={1.8} /></button>
        </div>
        <div className="modal-body">
          <div className="seg seg-modal">
            <button className={"seg-btn " + (type === "Competitor" ? "on" : "")} onClick={() => setType("Competitor")}>Competitor</button>
            <button className={"seg-btn " + (type === "Keyword" ? "on" : "")} onClick={() => setType("Keyword")}>Keyword</button>
          </div>
          {type === "Competitor" ? (
            found ? (
              <>
                <p className="modal-hint" style={{ marginBottom: 0 }}>Here&apos;s what we found. Edit anything, then add.</p>
                <CompanyCard data={found} onChange={setFound} onRemove={() => setFound(null)} compact />
              </>
            ) : (
              <>
                <WebsiteLookup placeholder="competitor.com" cta="Find" onFound={setFound} />
                <p className="modal-hint">Just paste the competitor&apos;s website. Issuefy finds their profiles and channels to monitor automatically.</p>
              </>
            )
          ) : (
            <>
              <input
                className="modal-input"
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitKeyword();
                }}
                placeholder="e.g. usage-based pricing"
              />
              <p className="modal-hint">Issuefy will track this theme across news, forums, reviews and social — and fold it into tomorrow&apos;s brief.</p>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {type === "Competitor" ? (
            <button className="btn btn-accent" onClick={confirmCompetitor} disabled={!found}>Add competitor</button>
          ) : (
            <button className="btn btn-accent" onClick={submitKeyword}>Add keyword</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddWatchModal;
