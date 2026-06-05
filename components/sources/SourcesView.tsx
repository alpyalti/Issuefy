"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { Favicon } from "@/components/signals/Favicon";
import { fmtAgo } from "@/lib/format";

/**
 * Client-side filter + preview shell for the Sources page.
 *
 * Filter pills toggle visibility by `source_type` (the column the worker
 * stamps when scraping — Competitor Website / News / Article / Review /
 * Public Discussion / Industry Page / Other). Clicking a row expands
 * its cleaned-text snippet inline so the user can read it without
 * leaving the dashboard.
 */
export interface SourceRow {
  id: string;
  title: string;
  url: string;
  domain: string;
  source_type: string;
  scraped_at: string;
  content_snippet: string | null;
}

export default function SourcesView({ sources }: { sources: SourceRow[] }) {
  const allTypes = useMemo(() => Array.from(new Set(sources.map((s) => s.source_type))).sort(), [sources]);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (activeType ? sources.filter((s) => s.source_type === activeType) : sources),
    [sources, activeType],
  );

  const pubs = useMemo(() => {
    const map = new Map<string, { domain: string; kind: string; items: SourceRow[] }>();
    for (const s of filtered) {
      const existing = map.get(s.domain) || { domain: s.domain, kind: s.source_type, items: [] };
      existing.items.push(s);
      map.set(s.domain, existing);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="sources-summary">
        <div className="ss-stat"><span className="ss-num">{pubs.length}</span><span className="ss-lab">sources tracked</span></div>
        <div className="ss-divider" />
        <div className="ss-stat"><span className="ss-num">{allTypes.length}</span><span className="ss-lab">source types</span></div>
        <div className="ss-divider" />
        <div className="ss-stat"><span className="ss-num">{filtered.length}</span><span className="ss-lab">links to verify</span></div>
      </div>

      {allTypes.length > 1 && (
        <div className="source-filters">
          <button
            className={"source-filter " + (activeType === null ? "on" : "")}
            onClick={() => setActiveType(null)}
          >
            All
            <span className="source-filter-count">{sources.length}</span>
          </button>
          {allTypes.map((t) => {
            const count = sources.filter((s) => s.source_type === t).length;
            return (
              <button
                key={t}
                className={"source-filter " + (activeType === t ? "on" : "")}
                onClick={() => setActiveType((cur) => (cur === t ? null : t))}
              >
                {t}
                <span className="source-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="source-pubs">
        {pubs.map((p) => (
          <div className="source-pub" key={p.domain}>
            <div className="source-pub-head">
              <Favicon s={{ name: p.domain, color: "var(--ink-3)", initials: "S" }} size={34} />
              <span className="source-pub-meta">
                <span className="source-pub-name">{p.domain}</span>
                <span className="source-pub-kind">{p.kind} · {p.items.length} link{p.items.length === 1 ? "" : "s"}</span>
              </span>
            </div>
            <div className="source-pub-links">
              {p.items.map((it) => {
                const isOpen = expanded.has(it.id);
                const hasSnippet = !!it.content_snippet && it.content_snippet.length > 60;
                return (
                  <div key={it.id} className="source-link-wrap">
                    <button
                      type="button"
                      className={"source-link source-link-row " + (isOpen ? "is-open" : "")}
                      onClick={() => (hasSnippet ? toggle(it.id) : window.open(it.url, "_blank"))}
                      aria-expanded={hasSnippet ? isOpen : undefined}
                    >
                      <span className="source-link-dot" />
                      <span className="source-link-head">{it.title}</span>
                      <span className="source-link-time">{fmtAgo(it.scraped_at)}</span>
                      <Icon name={hasSnippet ? (isOpen ? "ArrowUp01Icon" : "ArrowDown01Icon") : "ArrowUpRight01Icon"} size={14} stroke={1.7} />
                    </button>
                    {isOpen && it.content_snippet && (
                      <div className="source-link-preview">
                        <p>{it.content_snippet}</p>
                        <a href={it.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                          Open original <Icon name="ArrowUpRight01Icon" size={13} stroke={1.8} />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
