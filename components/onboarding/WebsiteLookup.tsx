"use client";

import { useState, useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { domainFrom, enrichFromWebsite, type CompanyData } from "./enrich";

/* Website lookup field with a simulated "finding…" state (modals.jsx WebsiteLookup).
   Phase 3 swaps enrichFromWebsite() for a POST /api/enrich call. */
export function WebsiteLookup({
  placeholder,
  cta,
  onFound,
  busyLabel,
}: {
  placeholder?: string;
  cta: string;
  onFound: (data: CompanyData) => void;
  busyLabel?: string;
}) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function run() {
    const d = domainFrom(val);
    if (!d || !d.includes(".")) {
      ref.current?.focus();
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setVal("");
      onFound(enrichFromWebsite(val));
    }, 950);
  }

  return (
    <div className="lookup">
      <div className="lookup-field">
        <Icon name="Globe02Icon" size={17} stroke={1.7} />
        <span className="lookup-proto">https://</span>
        <input
          ref={ref}
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder={placeholder}
          autoFocus
        />
      </div>
      <button className="btn btn-accent lookup-btn" onClick={run} disabled={busy}>
        {busy ? (
          <>
            <Icon name="Loading03Icon" size={16} stroke={2} className="spin" />
            {busyLabel || "Finding…"}
          </>
        ) : (
          cta
        )}
      </button>
    </div>
  );
}

export default WebsiteLookup;
