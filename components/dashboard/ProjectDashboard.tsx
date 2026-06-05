"use client";

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { SignalCard } from "@/components/signals/SignalCard";
import { Favicon } from "@/components/signals/Favicon";
import { EmptyState, EMPTY_SUMMARY_MESSAGE } from "@/components/ui/EmptyState";
import { ErrorState, ERROR_MESSAGES } from "@/components/ui/ErrorState";
import type { IconName } from "@/components/icons/registry";
import type { SignalItem, SourceItem } from "@/lib/types";

/* Real-data dashboard for /dashboard/[projectId]. Reuses prototype styles
   (dashboard.css) but is driven by server-fetched props rather than mock data. */

export interface ProjectDashboardProps {
  project: {
    id: string;
    name: string;
    company_name: string | null;
  };
  user: { name: string | null; email: string; initials: string };
  signals: SignalItem[];
  summary: {
    summary_date: string;
    summary_text: string | null;
    generated_at: string | null;
    empty_message: string;
    sources: SourceItem[];
  };
  recentSources: SourceItem[];
  competitors: { id: string; name: string; website_url: string; is_active: boolean }[];
  keywords: { id: string; keyword: string; is_active: boolean }[];
  initialView?: ProjectDashboardView;
}

export type ProjectDashboardView = "today" | "signals" | "competitors" | "opportunities" | "risks" | "saved";

const NAV: { id: string; label: string; icon: IconName; href?: string }[] = [
  { id: "today", label: "Today", icon: "DashboardSquare01Icon" },
  { id: "signals", label: "All signals", icon: "FlashIcon" },
  { id: "competitors", label: "Competitors", icon: "Target01Icon" },
  { id: "opportunities", label: "Opportunities", icon: "BulbIcon" },
  { id: "risks", label: "Risks", icon: "Alert02Icon" },
  { id: "saved", label: "Saved", icon: "Bookmark01Icon" },
  { id: "sources", label: "Sources", icon: "News01Icon" },
];

const PAGE: Record<string, { title: string; sub: string }> = {
  today: { title: "Today", sub: "Your latest market brief" },
  signals: { title: "All signals", sub: "Everything Issuefy surfaced for your watchlist" },
  competitors: { title: "Competitors", sub: "Moves from the companies you track" },
  opportunities: { title: "Opportunities", sub: "Openings worth acting on this week" },
  risks: { title: "Risks", sub: "Threats to defend against, flagged early" },
  saved: { title: "Saved", sub: "Signals you bookmarked to track over time" },
  sources: { title: "Sources", sub: "Every source behind your signals — click any to verify" },
};

const TABS = [
  { id: "all", label: "Latest signals" },
  { id: "competitor", label: "Competitors" },
  { id: "opportunity", label: "Opportunities" },
  { id: "threat", label: "Risks" },
];

export default function ProjectDashboard({
  project, user, signals: initialSignals, summary, recentSources, competitors, keywords, initialView = "today",
}: ProjectDashboardProps) {
  const router = useRouter();
  const [active, setActive] = useState(initialView);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [signals, setSignals] = useState<SignalItem[]>(initialSignals);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  // Synthesize the watchlist from real competitors + keywords (replaces mock).
  const watchlist = useMemo(() => ([
    ...competitors.map((c) => ({ label: c.name, type: "Competitor" as const, live: c.is_active })),
    ...keywords.map((k) => ({ label: k.keyword, type: "Keyword" as const, live: k.is_active })),
  ]), [competitors, keywords]);

  const companySet = useMemo(() => new Set(competitors.map((c) => c.name)), [competitors]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: signals.length, competitor: 0, opportunity: 0, threat: 0, signal: 0 };
    for (const s of signals) c[s.category] = (c[s.category] || 0) + 1;
    return c;
  }, [signals]);

  const savedCount = useMemo(() => signals.filter((s) => s.saved).length, [signals]);

  const list = useMemo(() => {
    const navTab: Record<string, string> = { today: "all", signals: "all", competitors: "competitor", opportunities: "opportunity", risks: "threat" };
    const effective = active === "today" || active === "signals" ? tab : (navTab[active] || "all");
    const q = query.trim().toLowerCase();
    return signals.filter((s) => {
      if (active === "saved" && !s.saved) return false;
      if (effective !== "all" && s.category !== effective) return false;
      if (q) {
        const hay = (s.title + " " + s.context + " " + s.tags.join(" ")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [signals, active, tab, query]);

  const meta = PAGE[active] || PAGE.today;
  const isFeedTabbed = active === "today" || active === "signals";

  async function toggleSave(id: string) {
    const current = signals.find((s) => s.id === id);
    if (!current) return;
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, saved: !s.saved } : s)));
    try {
      await fetch(`/api/signals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_saved: !current.saved }),
      });
    } catch {
      // Optimistic; revert on hard failure.
      setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, saved: current.saved } : s)));
    }
  }
  async function dismiss(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/signals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
    } catch { /* optimistic */ }
  }

  function runRefresh() {
    setRefreshErr(null);
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/refresh`, { method: "POST" });
        if (res.status === 429) {
          const { error } = await res.json().catch(() => ({ error: ERROR_MESSAGES.REFRESH_HOURLY }));
          setRefreshErr(error || ERROR_MESSAGES.REFRESH_HOURLY);
          return;
        }
        if (!res.ok) {
          setRefreshErr(ERROR_MESSAGES.SCRAPE_FAILED);
          return;
        }
        // Soft refresh the route — server component re-fetches everything.
        router.refresh();
      } catch {
        setRefreshErr(ERROR_MESSAGES.SCRAPE_FAILED);
      }
    });
  }

  return (
    <div className="dash">
      <aside className="sidebar">
        <Link href="/" className="brand side-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
        </Link>

        <div className="side-section">
          <div className="side-label">Workspace</div>
          <nav className="side-nav">
            {NAV.map((n) => {
              const onClick = n.id === "sources" ? () => router.push(`/dashboard/${project.id}/sources`) : () => setActive(n.id as ProjectDashboardView);
              const badge = n.id === "signals" ? counts.all : n.id === "saved" ? savedCount || null : null;
              return (
                <button key={n.id} className={"side-item " + (active === n.id ? "on" : "")} onClick={onClick}>
                  <Icon name={n.icon} size={19} stroke={active === n.id ? 1.9 : 1.6} />
                  <span>{n.label}</span>
                  {badge ? <span className="side-badge">{badge}</span> : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="side-section side-watch">
          <div className="side-label">Watchlist</div>
          <div className="watchlist">
            {competitors.length > 0 && <div className="watch-group">Competitors</div>}
            {competitors.map((c) => (
              <div className="watch-item" key={"c-" + c.id}>
                <span className={"watch-live " + (c.is_active ? "on" : "")} />
                <span className="watch-label">{c.name}</span>
              </div>
            ))}
            {keywords.length > 0 && <div className="watch-group">Keywords</div>}
            {keywords.map((k) => (
              <div className="watch-item" key={"k-" + k.id}>
                <span className={"watch-live " + (k.is_active ? "on" : "")} />
                <span className="watch-label">{k.keyword}</span>
              </div>
            ))}
            <Link href={`/dashboard/${project.id}/settings`} className="watch-add">
              <Icon name="PlusSignIcon" size={15} stroke={1.9} /> Manage watchlist
            </Link>
          </div>
        </div>

        <div className="side-foot">
          <Link href={`/dashboard/${project.id}/settings`} className="profile">
            <span className="avatar">{user.initials}</span>
            <span className="profile-meta">
              <span className="profile-name">{user.name || user.email}</span>
              <span className="profile-role">{project.name}</span>
            </span>
            <Icon name="Settings01Icon" size={17} stroke={1.6} />
          </Link>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{meta.title}</h1>
            <span className="topbar-date">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {meta.sub}
            </span>
          </div>
          <div className="topbar-right">
            <div className="search">
              <Icon name="Search01Icon" size={17} stroke={1.7} />
              <input placeholder="Search signals…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button className="search-clear" onClick={() => setQuery("")}>
                  <Icon name="Cancel01Icon" size={14} stroke={1.8} />
                </button>
              )}
            </div>
            <button className="icon-btn lg" onClick={runRefresh} title="Refresh data" disabled={refreshing}>
              <Icon name="RefreshIcon" size={18} stroke={1.6} className={refreshing ? "spin" : ""} />
            </button>
            <span className="avatar sm">{user.initials}</span>
          </div>
        </header>

        <div className="main-scroll">
          <div className="main-grid">
            <div className="feed">
              {refreshErr && <ErrorState message={refreshErr} onRetry={runRefresh} retryLabel="Try again" />}

              {active === "today" && (
                <SummaryCard summary={summary} onRegen={runRefresh} busy={refreshing} />
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
                  <h2 className="feed-title">{meta.title}<span className="feed-title-count">{list.length}</span></h2>
                )}
                <div className="feed-sort"><Icon name="FilterHorizontalIcon" size={15} stroke={1.7} /> Sorted by relevance</div>
              </div>

              <div className="signal-list">
                {list.length === 0 ? (
                  <EmptyState
                    icon="FlashIcon"
                    message={
                      active === "saved"
                        ? "No saved signals yet. Bookmark a signal to keep track of how it develops."
                        : EMPTY_SUMMARY_MESSAGE
                    }
                    ctaLabel={active === "saved" ? undefined : "Refresh data"}
                    onCta={active === "saved" ? undefined : runRefresh}
                  />
                ) : (
                  list.map((s) => (
                    <SignalCard
                      key={s.id} sig={s} saved={s.saved} leaving={false}
                      onSave={() => toggleSave(s.id)} onDismiss={() => dismiss(s.id)}
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
              <section className="rail-card mini">
                <div className="rail-head"><h3>Plan usage</h3></div>
                <div className="rail-tip">
                  <Icon name="Idea01Icon" size={15} stroke={1.7} color="#1E47C0" />
                  <span>Open settings to see this month&apos;s API budget and source cap.</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ───────────── Inline SummaryCard wired to real summary props ───────────── */

function SummaryCard({
  summary, onRegen, busy,
}: {
  summary: ProjectDashboardProps["summary"];
  onRegen: () => void;
  busy: boolean;
}) {
  const body = summary.summary_text;
  return (
    <section className={"brief-card " + (busy ? "busy" : "")}>
      <div className="brief-glow" />
      <div className="brief-head">
        <div className="brief-eyebrow">
          <Icon name="SparklesIcon" size={15} stroke={1.7} color="#cdd6ff" />
          <span>AI summary</span>
          <span className="brief-sep">·</span>
          <span>{summary.summary_date}</span>
        </div>
        <div className="brief-tools">
          <button className="brief-btn" onClick={onRegen} disabled={busy}>
            <Icon name="RefreshIcon" size={15} stroke={1.8} className={busy ? "spin" : ""} />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
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
      {busy && <div className="brief-shimmer" />}
    </section>
  );
}
