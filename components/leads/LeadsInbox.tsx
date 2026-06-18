"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { LeadCard, type Lead } from "./LeadCard";

/**
 * Central Leads inbox — all potential customers across the project's keywords.
 * Client-side filter bar (platform / status / keyword / min score); the lead
 * rows reuse the shared LeadCard (draft-reply + status actions).
 */
export default function LeadsInbox({ projectId, leads }: { projectId: string; leads: Lead[] }) {
  const [platform, setPlatform] = useState<"all" | "reddit" | "hackernews">("all");
  const [status, setStatus] = useState<"open" | "all" | "new" | "saved" | "replied">("open");
  const [keyword, setKeyword] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);

  const keywords = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads) if (l.keyword_id && l.keyword) m.set(l.keyword_id, l.keyword);
    return [...m.entries()].map(([id, kw]) => ({ id, keyword: kw }));
  }, [leads]);

  const filtered = useMemo(() => leads.filter((l) => {
    if (platform !== "all" && l.platform !== platform) return false;
    if (status === "open" && l.status === "dismissed") return false;
    if (status !== "open" && status !== "all" && l.status !== status) return false;
    if (keyword !== "all" && l.keyword_id !== keyword) return false;
    if (l.lead_score < minScore) return false;
    return true;
  }), [leads, platform, status, keyword, minScore]);

  const newCount = leads.filter((l) => l.status === "new").length;

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>Leads</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          Potential customers discussing your keywords on Reddit &amp; Hacker News.
          {newCount > 0 ? ` ${newCount} new.` : ""}
        </p>
      </header>

      {leads.length === 0 ? (
        <section className="card" style={{ padding: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <Icon name="Target01Icon" size={26} stroke={1.5} />
          <p style={{ fontSize: 14, color: "var(--ink-2)" }}>No leads yet.</p>
          <p className="muted" style={{ fontSize: 13, maxWidth: "46ch" }}>
            Each morning Issuefy scans Reddit &amp; Hacker News for people discussing your keywords who could be customers. Open a keyword and hit <b>Find leads now</b> to scan immediately.
          </p>
          <Link href={`/dashboard/${projectId}`} className="btn btn-ghost btn-sm">Back to dashboard</Link>
        </section>
      ) : (
        <>
          <div className="leads-filters">
            <Seg label="Platform" value={platform} onChange={(v) => setPlatform(v as typeof platform)}
              opts={[["all", "All"], ["reddit", "Reddit"], ["hackernews", "HN"]]} />
            <Seg label="Status" value={status} onChange={(v) => setStatus(v as typeof status)}
              opts={[["open", "Open"], ["new", "New"], ["saved", "Saved"], ["replied", "Replied"], ["all", "All"]]} />
            {keywords.length > 1 && (
              <label className="leads-filter-sel">
                <span>Keyword</span>
                <select className="fsel" value={keyword} onChange={(e) => setKeyword(e.target.value)}>
                  <option value="all">All keywords</option>
                  {keywords.map((k) => <option key={k.id} value={k.id}>{k.keyword}</option>)}
                </select>
              </label>
            )}
            <label className="leads-filter-sel">
              <span>Min score</span>
              <select className="fsel" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
                <option value={0}>Any</option>
                <option value={60}>60+</option>
                <option value={70}>70+</option>
                <option value={80}>80+</option>
              </select>
            </label>
            <span className="leads-count mono">{filtered.length} lead{filtered.length === 1 ? "" : "s"}</span>
          </div>

          {filtered.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5, padding: "20px 4px" }}>No leads match these filters.</p>
          ) : (
            <div className="leads-grid">
              {filtered.map((l) => <LeadCard key={l.id} projectId={projectId} lead={l} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Seg({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void; opts: [string, string][];
}) {
  return (
    <div className="leads-seg-wrap">
      <span className="leads-seg-label">{label}</span>
      <div className="seg leads-seg">
        {opts.map(([v, l]) => (
          <button key={v} className={"seg-btn " + (value === v ? "on" : "")} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
