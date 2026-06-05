"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { SignalCard } from "@/components/signals/SignalCard";
import { Favicon } from "@/components/signals/Favicon";
import { EmptyState, EMPTY_SUMMARY_MESSAGE } from "@/components/ui/EmptyState";
import { useDashboardView } from "./dashboard-view-context";
import FirstRunCard from "./FirstRunCard";
import type { IconName } from "@/components/icons/registry";
import type { SignalItem, SourceItem } from "@/lib/types";

/* Content-only project dashboard. The sidebar + topbar + ⌘K palette + refresh
   live in components/dashboard/DashChrome.tsx (mounted by the parent layout).
   This renders the feed + filter bar + right rail. */

export interface ProjectDashboardProps {
  project: {
    id: string;
    name: string;
    company_name: string | null;
  };
  signals: SignalItem[];
  summary: {
    summary_date: string;
    summary_text: string | null;
    generated_at: string | null;
    empty_message: string;
    sources: SourceItem[];
  };
  recentSources: SourceItem[];
  competitorNames: string[];
  /** True when the project has never been scraped (last_scraped_at IS NULL),
   *  used to show the activation card instead of the passive empty state. */
  firstRun?: boolean;
}

const TABS = [
  { id: "all", label: "Latest signals" },
  { id: "competitor", label: "Competitors" },
  { id: "opportunity", label: "Opportunities" },
  { id: "threat", label: "Risks" },
];
const DATE_RANGES: [string, string][] = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]];
const RANGE_HOURS: Record<string, number> = { "7d": 168, "30d": 720, "90d": 2160 };

export default function ProjectDashboard({
  project, signals: initialSignals, summary, recentSources, competitorNames, firstRun,
}: ProjectDashboardProps) {
  const { view, setView } = useDashboardView();

  const [signals, setSignals] = useState<SignalItem[]>(initialSignals);
  const [tab, setTab] = useState("all");
  const [dateRange, setDateRange] = useState("7d");
  const [company, setCompany] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  // Reset feed-side state when the URL view changes.
  useEffect(() => { setTab("all"); }, [view]);

  const companySet = useMemo(() => new Set(competitorNames), [competitorNames]);

  const TOPICS = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => s.tags.forEach((t) => { if (!competitorNames.includes(t)) set.add(t); }));
    return [...set].sort();
  }, [signals, competitorNames]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: signals.length, competitor: 0, opportunity: 0, threat: 0 };
    for (const s of signals) c[s.category] = (c[s.category] || 0) + 1;
    return c;
  }, [signals]);

  const savedCount = useMemo(() => signals.filter((s) => s.saved).length, [signals]);

  const maxHours = view === "today" ? 24 : (RANGE_HOURS[dateRange] ?? 99999);

  const base = useMemo(() => signals.filter((s) => {
    if (view === "saved" && !s.saved) return false;
    if (s.hoursAgo > maxHours) return false;
    if (view !== "today") {
      if (flagged && s.severity !== "high") return false;
      if (company && !(s.title + " " + s.context + " " + s.tags.join(" ")).toLowerCase().includes(company.toLowerCase())) return false;
      if (topic && !s.tags.includes(topic)) return false;
    }
    return true;
  }), [signals, view, maxHours, company, topic, flagged]);

  // Feed-level tab restriction (Today + signals view).
  const navView: Record<string, string> = { today: "all", signals: "all", competitor: "competitor", opportunity: "opportunity", threat: "threat" };
  const isFeedTabbed = view === "today" || view === "signals";
  const effectiveTab = isFeedTabbed ? tab : (navView[view] || "all");

  const list = useMemo(() => base.filter((s) => {
    if (effectiveTab !== "all" && s.category !== effectiveTab) return false;
    return true;
  }), [base, effectiveTab]);

  async function patchSignal(id: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch(`/api/signals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function toggleSave(id: string) {
    const current = signals.find((s) => s.id === id);
    if (!current) return;
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, saved: !s.saved } : s)));
    const ok = await patchSignal(id, { is_saved: !current.saved });
    if (!ok) setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, saved: current.saved } : s)));
  }
  async function dismiss(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
    await patchSignal(id, { dismissed: true });
  }
  async function setNote(id: string, next: string) {
    const current = signals.find((s) => s.id === id);
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, userNote: next || null } : s)));
    const ok = await patchSignal(id, { user_note: next });
    if (!ok && current) setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, userNote: current.userNote } : s)));
  }
  async function toggleActionDone(id: string, done: boolean) {
    const current = signals.find((s) => s.id === id);
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, actionDone: done } : s)));
    const ok = await patchSignal(id, { action_done: done });
    if (!ok && current) setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, actionDone: current.actionDone } : s)));
  }

  const viewLabel = view === "today" ? "Today"
    : view === "signals" ? "All signals"
    : view === "competitor" ? "Competitors"
    : view === "opportunity" ? "Opportunities"
    : view === "threat" ? "Risks"
    : "Saved";

  return (
    <div className="main-grid">
      <div className="feed">
        {/* First-run activation card sits ABOVE the summary card when the
            project has never been scraped — gives concrete timing + a CTA
            instead of the passive "awaiting" empty state. */}
        {view === "today" && firstRun && (
          <FirstRunCard projectId={project.id} firstCompetitorName={competitorNames[0]} />
        )}
        {view === "today" && <SummaryCard summary={summary} />}

        {view !== "today" && (
          <FilterBar
            dateRange={dateRange} setDateRange={setDateRange}
            company={company} setCompany={setCompany}
            topic={topic} setTopic={setTopic}
            flagged={flagged} setFlagged={setFlagged}
            companies={competitorNames}
            topics={TOPICS}
          />
        )}

        <div className="feed-head">
          {isFeedTabbed ? (
            <div className="tabs">
              {TABS.map((t) => (
                <button key={t.id} className={"tab " + (tab === t.id ? "on" : "")} onClick={() => setTab(t.id)}>
                  {t.label}<span className="tab-count">{(counts[t.id] ?? counts.all) || 0}</span>
                </button>
              ))}
            </div>
          ) : (
            <h2 className="feed-title">{viewLabel}<span className="feed-title-count">{list.length}</span></h2>
          )}
          <div className="feed-sort"><Icon name="FilterHorizontalIcon" size={15} stroke={1.7} /> Sorted by relevance</div>
        </div>

        <div className="signal-list">
          {list.length === 0 ? (
            <EmptyState
              icon={view === "saved" ? "Bookmark01Icon" : "FlashIcon"}
              message={
                view === "saved"
                  ? "No saved signals yet. Bookmark a signal to keep track of how it develops."
                  : view === "today"
                    ? EMPTY_SUMMARY_MESSAGE
                    : "No signals match these filters yet."
              }
            />
          ) : (
            list.map((s) => (
              <SignalCard
                key={s.id} sig={s} saved={s.saved} leaving={false}
                onSave={() => toggleSave(s.id)} onDismiss={() => dismiss(s.id)}
                onNoteChange={(next) => setNote(s.id, next)}
                onActionDoneToggle={(done) => toggleActionDone(s.id, done)}
                companySet={companySet}
              />
            ))
          )}
        </div>
      </div>

      <div className="rail">
        <section className="rail-card">
          <div className="rail-head">
            <h3>Recent sources</h3>
            <span className="rail-sub">Newest, click to verify</span>
          </div>
          <div className="rail-sources">
            {recentSources.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "8px 6px" }}>
                No sources yet. The first scrape lands tomorrow morning.
              </p>
            )}
            {recentSources.map((s, i) => (
              <a className="rail-source" href={s.url} target="_blank" rel="noopener noreferrer" key={i}>
                <Favicon s={s} size={26} />
                <span className="rail-src-meta">
                  <span className="rail-src-head">{s.headline}</span>
                  <span className="rail-src-sub">{s.name} · {s.time}</span>
                </span>
                <Icon name="ArrowUpRight01Icon" size={15} stroke={1.7} />
              </a>
            ))}
          </div>
          <Link href={`/dashboard/${project.id}/sources`} className="rail-all">
            View all sources <Icon name="ArrowRight01Icon" size={15} stroke={1.8} />
          </Link>
        </section>

        {/* Saved card — clickable to switch to the Saved view. */}
        {view !== "saved" ? (
          <button
            className="rail-card mini saved-card"
            onClick={() => setView("saved")}
          >
            <div className="rail-head"><h3>Saved</h3><Icon name="ArrowRight01Icon" size={15} stroke={1.7} /></div>
            <div className="saved-count">
              <span className="saved-big">{savedCount}</span>
              <span>signal{savedCount === 1 ? "" : "s"} saved for later</span>
            </div>
          </button>
        ) : (
          <section className="rail-card mini">
            <div className="rail-head"><h3>How saving works</h3></div>
            <div className="rail-tip">
              <Icon name="Idea01Icon" size={15} stroke={1.7} color="#1E47C0" />
              <span>Bookmarked signals stay here so you can watch a story develop across the week.</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ───────────── Summary card ───────────── */

function SummaryCard({ summary }: { summary: ProjectDashboardProps["summary"] }) {
  const body = summary.summary_text;
  return (
    <section className="brief-card">
      <div className="brief-glow" />
      <div className="brief-head">
        <div className="brief-eyebrow">
          <Icon name="SparklesIcon" size={15} stroke={1.7} color="#cdd6ff" />
          <span>AI summary</span>
          <span className="brief-sep">·</span>
          <span>{summary.summary_date}</span>
        </div>
      </div>
      {body ? (
        <>
          <p className="brief-lead">Today&apos;s brief</p>
          <p className="brief-body">{body}</p>
          {summary.sources.length > 0 && (
            <div className="brief-moves">
              {summary.sources.slice(0, 4).map((s, i) => (
                <a key={i} className="move" href={s.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="move-num">{i + 1}</span>
                  <span className="move-text">{s.headline} <span style={{ color: "#9aa3b2" }}>· {s.name}</span></span>
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="brief-lead">Awaiting your first brief.</p>
          <p className="brief-body">{summary.empty_message}</p>
        </>
      )}
    </section>
  );
}

/* ───────────── Filter bar (date / company / topic / flagged) ───────────── */

interface DDOption { value: string; label: string; dot?: string; }

function Dropdown({ icon, label, value, options, onChange }: { icon?: IconName; label: string; value: string | null; options: DDOption[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find((o) => o.value === (value || ""));
  return (
    <div className={"dd " + (open ? "open" : "")} ref={ref}>
      <button className="dd-btn" onClick={() => setOpen((o) => !o)}>
        {icon && <Icon name={icon} size={15} stroke={1.7} />}
        {cur && cur.dot && <span className="dd-dot" style={{ background: cur.dot }} />}
        <span className="dd-val">{cur ? cur.label : label}</span>
        <Icon name="ArrowDown01Icon" size={14} stroke={2} className="dd-chev" />
      </button>
      {open && (
        <div className="dd-menu">
          {options.map((o) => (
            <button key={o.value || "all"} className={"dd-item " + (o.value === (value || "") ? "sel" : "")} onClick={() => { onChange(o.value || null); setOpen(false); }}>
              {o.dot ? <span className="dd-dot" style={{ background: o.dot }} /> : null}
              <span className="dd-item-label">{o.label}</span>
              {o.value === (value || "") && <Icon name="Tick02Icon" size={15} stroke={2} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  dateRange, setDateRange, company, setCompany, topic, setTopic, flagged, setFlagged, companies, topics,
}: {
  dateRange: string;
  setDateRange: (v: string) => void;
  company: string | null;
  setCompany: (v: string | null) => void;
  topic: string | null;
  setTopic: (v: string | null) => void;
  flagged: boolean;
  setFlagged: (fn: boolean) => void;
  companies: string[];
  topics: string[];
}) {
  const companyOpts: DDOption[] = [{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: c, label: c, dot: "var(--accent)" }))];
  const topicOpts: DDOption[] = [{ value: "", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))];
  return (
    <div className="filterbar">
      <div className="seg">
        {DATE_RANGES.map(([v, l]) => (
          <button key={v} className={"seg-btn " + (dateRange === v ? "on" : "")} onClick={() => setDateRange(v)}>{l}</button>
        ))}
      </div>
      <div className="filter-selects">
        <button className={"flag-toggle " + (flagged ? "on" : "")} onClick={() => setFlagged(!flagged)} title="Show flagged signals only">
          <Icon name="Flag02Icon" size={15} stroke={1.8} /> Flagged
        </button>
        <Dropdown icon="Target01Icon" label="All companies" value={company} options={companyOpts} onChange={setCompany} />
        <Dropdown icon="Tag01Icon" label="All topics" value={topic} options={topicOpts} onChange={setTopic} />
      </div>
    </div>
  );
}
