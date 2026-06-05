"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { ERROR_MESSAGES } from "@/components/ui/ErrorState";

/**
 * Persistent sidebar + topbar + ⌘K command palette for every project page.
 * URL drives the active nav item; ⌘K opens a quick-jump palette with nav
 * destinations and any signal-search/source-search results that come back
 * from /api/projects/:id/signals?q=…
 */

interface Project { id: string; name: string; }
interface User { name: string | null; email: string; initials: string; }
interface Competitor { id: string; name: string; is_active: boolean; }
interface Keyword { id: string; keyword: string; is_active: boolean; }

const NAV: { id: string; label: string; icon: IconName; href: (pid: string) => string; query?: string }[] = [
  { id: "today", label: "Today", icon: "DashboardSquare01Icon", href: (id) => `/dashboard/${id}` },
  { id: "signals", label: "All signals", icon: "FlashIcon", href: (id) => `/dashboard/${id}?view=signals`, query: "signals" },
  { id: "competitors", label: "Competitors", icon: "Target01Icon", href: (id) => `/dashboard/${id}?view=competitor`, query: "competitor" },
  { id: "opportunities", label: "Opportunities", icon: "BulbIcon", href: (id) => `/dashboard/${id}?view=opportunity`, query: "opportunity" },
  { id: "risks", label: "Risks", icon: "Alert02Icon", href: (id) => `/dashboard/${id}?view=threat`, query: "threat" },
  { id: "saved", label: "Saved", icon: "Bookmark01Icon", href: (id) => `/dashboard/${id}?view=saved`, query: "saved" },
  { id: "sources", label: "Sources", icon: "News01Icon", href: (id) => `/dashboard/${id}/sources` },
];

const NAV_TITLES: Record<string, { title: string; sub: string }> = {
  today: { title: "Today", sub: "Your latest market brief" },
  signals: { title: "All signals", sub: "Everything Issuefy surfaced for your watchlist" },
  competitor: { title: "Competitors", sub: "Moves from the companies you track" },
  opportunity: { title: "Opportunities", sub: "Openings worth acting on this week" },
  threat: { title: "Risks", sub: "Threats to defend against, flagged early" },
  saved: { title: "Saved", sub: "Signals you bookmarked to track over time" },
  sources: { title: "Sources", sub: "Every source behind your signals — click any to verify" },
  settings: { title: "Settings", sub: "Project, watchlist and plan usage" },
};

export default function DashChrome({
  project, user, competitors, keywords, savedCount, children,
}: {
  project: Project;
  user: User;
  competitors: Competitor[];
  keywords: Keyword[];
  savedCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  // Determine active nav from URL.
  const activeFromUrl = (() => {
    if (pathname?.endsWith("/sources")) return "sources";
    if (pathname?.endsWith("/settings")) return "settings";
    const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
    const view = url?.searchParams.get("view");
    if (view) return view;
    return "today";
  })();

  // Open ⌘K with Cmd/Ctrl + K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  function navTo(id: string) {
    const item = NAV.find((n) => n.id === id || n.query === id);
    if (item) router.push(item.href(project.id));
  }

  const title = NAV_TITLES[activeFromUrl] || NAV_TITLES.today;

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
              const isActive =
                (n.id === "today" && activeFromUrl === "today") ||
                (n.id === "signals" && activeFromUrl === "signals") ||
                (n.id === "competitors" && activeFromUrl === "competitor") ||
                (n.id === "opportunities" && activeFromUrl === "opportunity") ||
                (n.id === "risks" && activeFromUrl === "threat") ||
                (n.id === "saved" && activeFromUrl === "saved") ||
                (n.id === "sources" && activeFromUrl === "sources");
              const badge = n.id === "saved" ? (savedCount || null) : null;
              return (
                <button key={n.id} className={"side-item " + (isActive ? "on" : "")} onClick={() => navTo(n.id)}>
                  <Icon name={n.icon} size={19} stroke={isActive ? 1.9 : 1.6} />
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
            <button className="icon-btn lg" onClick={runRefresh} title="Refresh data" disabled={refreshing}>
              <Icon name="RefreshIcon" size={18} stroke={1.6} className={refreshing ? "spin" : ""} />
            </button>
            <span className="avatar sm">{user.initials}</span>
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projectId={project.id}
        onJump={(id) => { navTo(id); setPaletteOpen(false); }}
      />
    </div>
  );
}

/* ───────────── ⌘K Command Palette ───────────── */

interface SignalHit { id: string; title: string; category: string; }

function CommandPalette({
  open, onClose, projectId, onJump,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onJump: (id: string) => void;
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
      setSignals([]);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setSel(0); }, [q]);

  // Fetch top signals for the project once when the palette opens; filter
  // client-side as the user types. Avoids a request per keystroke.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/signals?limit=40`)
      .then((r) => r.ok ? r.json() : { signals: [] })
      .then((j: { signals: SignalHit[] }) => { if (!cancelled) setSignals(j.signals || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, projectId]);

  if (!open) return null;

  const ql = q.trim().toLowerCase();
  const navItems = [
    { id: "today", label: "Today", icon: "DashboardSquare01Icon" as IconName, sub: "Go to today's brief" },
    { id: "signals", label: "All signals", icon: "FlashIcon" as IconName, sub: "Browse every signal" },
    { id: "competitor", label: "Competitors", icon: "Target01Icon" as IconName, sub: "Competitor moves" },
    { id: "opportunity", label: "Opportunities", icon: "BulbIcon" as IconName, sub: "Openings worth acting on" },
    { id: "threat", label: "Risks", icon: "Alert02Icon" as IconName, sub: "Threats flagged early" },
    { id: "saved", label: "Saved", icon: "Bookmark01Icon" as IconName, sub: "Bookmarked signals" },
    { id: "sources", label: "Sources", icon: "News01Icon" as IconName, sub: "All sources" },
    { id: "settings", label: "Settings", icon: "Settings01Icon" as IconName, sub: "Watchlist, plan and usage" },
  ].filter((n) => !ql || n.label.toLowerCase().includes(ql));

  const sigItems = ql
    ? signals.filter((s) => s.title.toLowerCase().includes(ql) || s.category.toLowerCase().includes(ql)).slice(0, 5)
    : [];

  const groups = [];
  if (navItems.length) groups.push({ label: "Navigate", kind: "nav", items: navItems });
  if (sigItems.length) groups.push({ label: "Signals", kind: "signal", items: sigItems });
  const flat: { type: "nav" | "signal"; data: typeof navItems[number] | SignalHit }[] = [];
  navItems.forEach((n) => flat.push({ type: "nav", data: n }));
  sigItems.forEach((s) => flat.push({ type: "signal", data: s }));

  function activate(idx: number) {
    const item = flat[idx];
    if (!item) return;
    if (item.type === "nav") {
      const id = (item.data as typeof navItems[number]).id;
      if (id === "sources") router.push(`/dashboard/${projectId}/sources`);
      else if (id === "settings") router.push(`/dashboard/${projectId}/settings`);
      else onJump(id);
    } else {
      // Signal: jump to that signal's view (route by category).
      const s = item.data as SignalHit;
      const v = mapDbCategoryToView(s.category);
      onJump(v);
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
                const isSig = g.kind === "signal";
                const title = isSig ? (item as SignalHit).title : (item as typeof navItems[number]).label;
                const sub = isSig ? (item as SignalHit).category : (item as typeof navItems[number]).sub;
                const icName = isSig ? "FlashIcon" : (item as typeof navItems[number]).icon;
                return (
                  <div
                    key={(item as { id?: string }).id ?? cur}
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

function mapDbCategoryToView(c: string): string {
  if (c === "Competitor Move" || c === "Pricing / Offer Change" || c === "Service Demand Signal") return "competitor";
  if (c === "Market Opportunity") return "opportunity";
  if (c === "Threat / Risk" || c === "Regulation / Policy") return "threat";
  return "signals";
}
