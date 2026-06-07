"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { ERROR_MESSAGES } from "@/components/ui/ErrorState";
import { DashboardViewProvider, useDashboardView, type DashboardView } from "./dashboard-view-context";
import { DashboardRoleProvider, useDashboardRole, canManage, type DashboardRole } from "./dashboard-role-context";
import MobileNav from "./MobileNav";
import MobileDrawer from "./MobileDrawer";
import ProjectSwitcher from "./ProjectSwitcher";
import NotificationBell from "./NotificationBell";
import ProfileMenu, { type AccountRiderInfo } from "./ProfileMenu";

interface OwnedProject {
  id: string;
  name: string;
  company_name: string | null;
  /** Caller's role on the project — drives the EDITOR/VIEWER chip in the switcher. */
  role: "owner" | "editor" | "viewer";
}

/**
 * Persistent sidebar + topbar + ⌘K command palette.
 *
 * The within-feed views (Today / Signals / Competitor / Opportunity / Risks /
 * Saved) are client-only state via DashboardViewContext — clicking them
 * doesn't change the URL, doesn't trigger a server fetch. Feels instant.
 *
 * Real-route nav (Sources, Settings) uses <Link> so Next prefetches on hover
 * and the transition is as fast as it can be on those pages too.
 */

interface Project { id: string; name: string; }
interface User { name: string | null; email: string; initials: string; }
interface Competitor { id: string; name: string; is_active: boolean; }
interface Keyword { id: string; keyword: string; is_active: boolean; }

const FEED_VIEWS: { id: DashboardView; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "DashboardSquare01Icon" },
  { id: "signals", label: "All signals", icon: "FlashIcon" },
  { id: "competitor", label: "Competitors", icon: "Target01Icon" },
  { id: "opportunity", label: "Opportunities", icon: "BulbIcon" },
  { id: "threat", label: "Risks", icon: "Alert02Icon" },
  { id: "saved", label: "Saved", icon: "Bookmark01Icon" },
];

const VIEW_TITLES: Record<string, { title: string; sub: string }> = {
  today: { title: "Today", sub: "Your latest market brief" },
  signals: { title: "All signals", sub: "Everything Issuefy surfaced for your watchlist" },
  competitor: { title: "Competitors", sub: "Moves from the companies you track" },
  opportunity: { title: "Opportunities", sub: "Openings worth acting on this week" },
  threat: { title: "Risks", sub: "Threats to defend against, flagged early" },
  saved: { title: "Saved", sub: "Signals you bookmarked to track over time" },
  sources: { title: "Sources", sub: "Every source behind your signals — click any to verify" },
  settings: { title: "Settings", sub: "Project, watchlist and plan usage" },
  archive: { title: "Archive", sub: "Past daily briefs" },
  account: { title: "Account", sub: "Your identity, plan, billing and security" },
};

export default function DashChrome(props: {
  project: Project;
  user: User;
  competitors: Competitor[];
  keywords: Keyword[];
  savedCount: number;
  newSignalCount: number;
  ownedProjects: OwnedProject[];
  /** Caller's role on the currently-open project (Teams Phase 5). Threaded
   *  to every client component below via DashboardRoleProvider. */
  role: DashboardRole;
  /** Optional rider-billing info — set when this user has no own subscription
   *  but is a member of someone else's actively-subscribed project. Drives
   *  the "Manage subscription" → contact-owner alert in ProfileMenu. */
  rider?: AccountRiderInfo;
  children: React.ReactNode;
}) {
  return (
    <DashboardRoleProvider role={props.role}>
      <DashboardViewProvider>
        <DashChromeInner {...props} />
      </DashboardViewProvider>
    </DashboardRoleProvider>
  );
}

function DashChromeInner({
  project, user, competitors, keywords, savedCount, newSignalCount, ownedProjects, rider, children,
}: {
  project: Project;
  user: User;
  competitors: Competitor[];
  keywords: Keyword[];
  savedCount: number;
  newSignalCount: number;
  ownedProjects: OwnedProject[];
  rider?: AccountRiderInfo;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { view, setView } = useDashboardView();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  // Project role. Viewers can't trigger a refresh (it burns the owner's
  // scrape budget) or use the "r" shortcut.
  const role = useDashboardRole();
  const canEdit = canManage(role);

  // Real-route active: sources/settings/account/archive get highlighted by URL.
  const realRoute =
    pathname?.endsWith("/sources") ? "sources" :
    pathname?.endsWith("/settings") ? "settings" :
    pathname?.endsWith("/account") ? "account" :
    pathname?.includes("/archive") ? "archive" :
    null;
  const isDashboardIndex = !realRoute; // true on /dashboard/[id]
  const activeView: string = realRoute ?? view;

  // Keyboard shortcuts. ⌘K opens the palette; r runs a refresh; ? toggles
  // the shortcuts overlay. Single-letter shortcuts are ignored when focus is
  // in a text input (so "r" while typing a note doesn't fire a refresh).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      // Ignore single-letter shortcuts while typing into an input or modal.
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (editable || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (canEdit) runRefresh();
      } else if (e.key === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // runRefresh is stable per render; including it would re-bind on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutsOpen]);

  // When the user is on a real route (sources / settings), warm Next's router
  // cache for the dashboard index. By the time they click a feed-view button,
  // the data is ready and the back-navigation feels instant — same trick the
  // sidebar <Link prefetch> uses, but for the buttons.
  useEffect(() => {
    if (realRoute) {
      router.prefetch(`/dashboard/${project.id}`);
    }
  }, [realRoute, router, project.id]);

  // Conversely: when on the dashboard index, warm the sources + settings
  // pages too. The sidebar <Link prefetch> handles this on hover, but
  // calling it explicitly here means even keyboard users (⌘K → Settings)
  // get the prefetched data path.
  useEffect(() => {
    if (isDashboardIndex) {
      router.prefetch(`/dashboard/${project.id}/sources`);
      router.prefetch(`/dashboard/${project.id}/settings`);
    }
  }, [isDashboardIndex, router, project.id]);

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
        router.refresh();
      } catch {
        setRefreshErr(ERROR_MESSAGES.SCRAPE_FAILED);
      }
    });
  }

  function switchToView(v: DashboardView) {
    // If we're not on the dashboard index, hop there first; then context
    // takes over for instant view-switch.
    if (!isDashboardIndex) {
      setView(v);
      router.push(`/dashboard/${project.id}`);
    } else {
      setView(v);
    }
  }

  const title = VIEW_TITLES[activeView] || VIEW_TITLES.today;

  return (
    <div className="dash">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand side-brand" aria-label="Issuefy dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
        </Link>

        <ProjectSwitcher
          current={project}
          currentRole={ownedProjects.find((p) => p.id === project.id)?.role}
          projects={ownedProjects}
        />

        <div className="side-section">
          <div className="side-label">Workspace</div>
          <nav className="side-nav">
            {FEED_VIEWS.map((n) => {
              const isActive = activeView === n.id;
              const badge = n.id === "saved" ? (savedCount || null) : null;
              return (
                <button
                  key={n.id}
                  className={"side-item " + (isActive ? "on" : "")}
                  onClick={() => switchToView(n.id)}
                >
                  <Icon name={n.icon} size={19} stroke={isActive ? 1.9 : 1.6} />
                  <span>{n.label}</span>
                  {badge ? <span className="side-badge">{badge}</span> : null}
                </button>
              );
            })}
            <Link
              href={`/dashboard/${project.id}/sources`}
              prefetch
              className={"side-item " + (activeView === "sources" ? "on" : "")}
            >
              <Icon name="News01Icon" size={19} stroke={activeView === "sources" ? 1.9 : 1.6} />
              <span>Sources</span>
            </Link>
            <Link
              href={`/dashboard/${project.id}/archive`}
              prefetch
              className={"side-item " + (activeView === "archive" ? "on" : "")}
            >
              <Icon name="LinkSquare02Icon" size={19} stroke={activeView === "archive" ? 1.9 : 1.6} />
              <span>Archive</span>
            </Link>
            <Link
              href={`/dashboard/${project.id}/settings`}
              prefetch
              className={"side-item " + (activeView === "settings" ? "on" : "")}
            >
              <Icon name="Settings01Icon" size={19} stroke={activeView === "settings" ? 1.9 : 1.6} />
              <span>Settings</span>
            </Link>
          </nav>
        </div>

        <div className="side-section side-watch">
          <div className="side-label">Watchlist</div>
          <div className="watchlist">
            {/* Each competitor / keyword is a Link to the project settings
                page — clicking jumps the user to where they can edit it. */}
            {competitors.length > 0 && <div className="watch-group">Competitors</div>}
            {competitors.map((c) => (
              <Link
                href={`/dashboard/${project.id}/settings`}
                prefetch
                className="watch-item is-comp"
                key={"c-" + c.id}
                title={`Edit ${c.name} in project settings`}
              >
                <span className={"watch-live " + (c.is_active ? "on" : "")} />
                <span className="watch-label">{c.name}</span>
              </Link>
            ))}
            {keywords.length > 0 && <div className="watch-group">Keywords</div>}
            {keywords.map((k) => (
              <Link
                href={`/dashboard/${project.id}/settings`}
                prefetch
                className="watch-item is-kw"
                key={"k-" + k.id}
                title={`Edit ${k.keyword} in project settings`}
              >
                <span className={"watch-live " + (k.is_active ? "on" : "")} />
                <span className="watch-label">{k.keyword}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="side-foot">
          <ProfileMenu projectId={project.id} user={user} rider={rider} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="topbar-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="Menu01Icon" size={22} stroke={1.7} />
          </button>
          <div className="topbar-title">
            <h1>{title.title}</h1>
            <span className="topbar-date">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {title.sub}
            </span>
          </div>
          <div className="topbar-right">
            <button className="search" onClick={() => setPaletteOpen(true)} style={{ cursor: "pointer" }}>
              <Icon name="Search01Icon" size={17} stroke={1.7} />
              <span style={{ flex: 1, textAlign: "left", color: "var(--ink-4)", fontSize: 14 }}>Search or jump to…</span>
              <span className="kbd">⌘K</span>
            </button>
            <button
              className="icon-btn lg topbar-search-mobile"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Icon name="Search01Icon" size={18} stroke={1.7} />
            </button>
            <NotificationBell unread={newSignalCount} />
            <button
              className="icon-btn lg"
              onClick={runRefresh}
              title={canEdit ? "Refresh data" : "Viewers can't trigger a refresh"}
              disabled={refreshing || !canEdit}
            >
              <Icon name="RefreshIcon" size={18} stroke={1.6} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </header>
        <div className="main-scroll">
          {refreshErr && (
            <div style={{ maxWidth: 1200, margin: "16px auto 0", padding: "0 28px" }}>
              <div className="empty" style={{ padding: "16px 20px", borderColor: "var(--neg-line)", background: "var(--neg-bg)", color: "var(--neg)", flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon name="Alert02Icon" size={20} stroke={1.6} color="var(--neg)" />
                <span style={{ flex: 1, fontSize: 14 }}>{refreshErr}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setRefreshErr(null)}>Dismiss</button>
              </div>
            </div>
          )}
          {children}
        </div>
      </main>

      <MobileNav projectId={project.id} />

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={project.id}
        projectName={project.name}
        userName={user.name || user.email}
        competitors={competitors}
        keywords={keywords}
        initials={user.initials}
        projects={ownedProjects}
        rider={rider}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projectId={project.id}
        competitors={competitors}
        keywords={keywords}
        onJump={(v) => { switchToView(v); setPaletteOpen(false); }}
      />

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

/* ───────────── Keyboard shortcuts help overlay ───────────── */

function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const items: Array<{ keys: string[]; label: string }> = [
    { keys: ["⌘", "K"], label: "Open the command palette" },
    { keys: ["R"], label: "Refresh data" },
    { keys: ["?"], label: "Show / hide this overlay" },
    { keys: ["Esc"], label: "Close any open dialog" },
  ];
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" style={{ maxHeight: "auto", padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 500 }}>Keyboard shortcuts</h3>
          <span className="esc" style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "3px 7px" }}>ESC</span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => (
            <div key={it.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{it.label}</span>
              <span style={{ display: "flex", gap: 4 }}>
                {it.keys.map((k) => (
                  <span key={k} className="kbd" style={{ background: "var(--surface)", border: "1px solid var(--line-2)", padding: "3px 8px", fontSize: 11.5, fontWeight: 600 }}>{k}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── ⌘K Command Palette ───────────── */

/** Full signal row returned by /api/projects/:id/signals. Includes description
 *  + importance so we can match on those AND show a richer subtitle than just
 *  the category. */
interface SignalHit {
  id: string;
  title: string;
  category: string;
  description: string;
  importance: "High" | "Medium" | "Low";
}

/** Watchlist row passed in from DashChrome for entity-style search. */
interface WatchEntity {
  kind: "competitor" | "keyword";
  id: string;
  label: string;
}

function CommandPalette({
  open, onClose, projectId, competitors, keywords, onJump,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  competitors: Competitor[];
  keywords: Keyword[];
  onJump: (v: DashboardView) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [signals, setSignals] = useState<SignalHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      // Don't clear signals on open — keeps the empty-query "Recent signals"
      // group warm across reopens within a session.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Pull up to the API's max so we can search across a wide window.
    fetch(`/api/projects/${projectId}/signals?limit=200`)
      .then((r) => r.ok ? r.json() : { signals: [] })
      .then((j: { signals: SignalHit[] }) => { if (!cancelled) setSignals(j.signals || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, projectId]);

  if (!open) return null;

  const ql = q.trim().toLowerCase();
  type NavOpt = { id: DashboardView | "sources" | "settings"; label: string; icon: IconName; sub: string };
  const ALL_NAV: NavOpt[] = [
    { id: "today", label: "Today", icon: "DashboardSquare01Icon", sub: "Go to today's brief" },
    { id: "signals", label: "All signals", icon: "FlashIcon", sub: "Browse every signal" },
    { id: "competitor", label: "Competitors", icon: "Target01Icon", sub: "Competitor moves" },
    { id: "opportunity", label: "Opportunities", icon: "BulbIcon", sub: "Openings worth acting on" },
    { id: "threat", label: "Risks", icon: "Alert02Icon", sub: "Threats flagged early" },
    { id: "saved", label: "Saved", icon: "Bookmark01Icon", sub: "Bookmarked signals" },
    { id: "sources", label: "Sources", icon: "News01Icon", sub: "All sources" },
    { id: "settings", label: "Settings", icon: "Settings01Icon", sub: "Watchlist, plan and usage" },
  ];
  // Only show nav items when there's no query (it's the default state) OR when
  // the query matches a nav label / sub. Hiding the full Navigate group on
  // every keystroke makes signal results way more visible.
  const navItems: NavOpt[] = !ql
    ? ALL_NAV
    : ALL_NAV.filter((n) => n.label.toLowerCase().includes(ql) || n.sub.toLowerCase().includes(ql));

  // Watchlist entities (competitors + keywords) — search by name only.
  const watch: WatchEntity[] = [
    ...competitors.map<WatchEntity>((c) => ({ kind: "competitor", id: c.id, label: c.name })),
    ...keywords.map<WatchEntity>((k) => ({ kind: "keyword", id: k.id, label: k.keyword })),
  ];
  const watchItems = ql
    ? watch.filter((w) => w.label.toLowerCase().includes(ql)).slice(0, 8)
    : [];

  // Signals — broad match across title + description + category + importance.
  // Default state (no query): show the 8 most recent so the palette is useful
  // immediately, not just as a search box.
  const sigItems = ql
    ? signals.filter((s) =>
        s.title.toLowerCase().includes(ql) ||
        (s.description ?? "").toLowerCase().includes(ql) ||
        s.category.toLowerCase().includes(ql) ||
        (s.importance ?? "").toLowerCase().includes(ql),
      ).slice(0, 10)
    : signals.slice(0, 8);

  const groups: { label: string; kind: "nav" | "signal" | "watch"; items: (NavOpt | SignalHit | WatchEntity)[] }[] = [];
  if (navItems.length) groups.push({ label: "Navigate", kind: "nav", items: navItems });
  if (watchItems.length) groups.push({ label: "Watchlist", kind: "watch", items: watchItems });
  if (sigItems.length) groups.push({ label: ql ? "Signals" : "Recent signals", kind: "signal", items: sigItems });

  const flat: { kind: "nav" | "signal" | "watch"; data: NavOpt | SignalHit | WatchEntity }[] = [];
  groups.forEach((g) => g.items.forEach((item) => flat.push({ kind: g.kind, data: item })));

  function activate(idx: number) {
    const item = flat[idx];
    if (!item) return;
    if (item.kind === "nav") {
      const opt = item.data as NavOpt;
      if (opt.id === "sources") router.push(`/dashboard/${projectId}/sources`);
      else if (opt.id === "settings") router.push(`/dashboard/${projectId}/settings`);
      else onJump(opt.id);
    } else if (item.kind === "watch") {
      // Competitor / keyword → drop into project settings where it can be
      // edited; the deep-link to a specific row is implicit (Settings shows
      // them all).
      router.push(`/dashboard/${projectId}/settings`);
      onClose();
    } else {
      const s = item.data as SignalHit;
      // Jump to the matching view AND set a hash so ProjectDashboard can
      // scroll to / highlight the specific signal card.
      onJump(mapDbCategoryToView(s.category));
      // Defer the hash write so the view-switch state lands first.
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.hash = `sig-${s.id}`;
        }
      }, 30);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => Math.min(x + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); activate(sel); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  let idx = -1;
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmdk-input">
          <Icon name="Search01Icon" size={19} stroke={1.7} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search signals or jump to a view…" />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-list">
          {flat.length === 0 && <div className="cmdk-empty">No matches for &ldquo;{q}&rdquo;</div>}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="cmdk-group">{g.label}</div>
              {g.items.map((item) => {
                idx++;
                const cur = idx;
                let title: string;
                let sub: string;
                let icName: IconName;
                if (g.kind === "signal") {
                  const s = item as SignalHit;
                  title = s.title;
                  sub = `${s.importance ?? "—"} · ${s.category}`;
                  icName = "FlashIcon";
                } else if (g.kind === "watch") {
                  const w = item as WatchEntity;
                  title = w.label;
                  sub = w.kind === "competitor" ? "Competitor in your watchlist" : "Keyword in your watchlist";
                  icName = w.kind === "competitor" ? "Target01Icon" : "Tag01Icon";
                } else {
                  const opt = item as NavOpt;
                  title = opt.label;
                  sub = opt.sub;
                  icName = opt.icon;
                }
                const key = (item as { id?: string }).id ?? cur;
                return (
                  <div
                    key={key}
                    className={"cmdk-item " + (cur === sel ? "sel" : "")}
                    onMouseEnter={() => setSel(cur)}
                    onClick={() => activate(cur)}
                  >
                    <span className="cmdk-ic"><Icon name={icName} size={17} stroke={1.7} /></span>
                    <span className="cmdk-tx">
                      <span className="cmdk-t">{title}</span>
                      <span className="cmdk-s">{sub}</span>
                    </span>
                    <span className="cmdk-enter">↵</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function mapDbCategoryToView(c: string): DashboardView {
  if (c === "Competitor Move" || c === "Pricing / Offer Change" || c === "Service Demand Signal") return "competitor";
  if (c === "Market Opportunity") return "opportunity";
  if (c === "Threat / Risk" || c === "Regulation / Policy") return "threat";
  return "signals";
}
