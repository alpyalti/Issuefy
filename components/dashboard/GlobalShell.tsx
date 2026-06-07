"use client";

import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import ProfileMenu, { type AccountRiderInfo } from "./ProfileMenu";

interface User {
  name: string | null;
  email: string;
  initials: string;
}

/**
 * Stripped-down dashboard chrome for cross-project pages (e.g. /dashboard
 * project list) that have no current project. Renders the same .dash +
 * .sidebar + .main layout as the project-scoped DashChrome so visiting
 * /dashboard with 2+ projects no longer feels like leaving the app.
 *
 * Excluded by design:
 *   - ProjectSwitcher (you're already looking at the list)
 *   - Workspace nav / Watchlist (project-scoped)
 *   - Search / Notification / Refresh (project-scoped)
 *
 * Kept:
 *   - Brand
 *   - ProfileMenu (Account / Manage subscription / Help / Log out)
 *   - Topbar with title + optional action slot
 */
export default function GlobalShell({
  user,
  /** Stable user-scoped project ID used by ProfileMenu's Account link — any
   *  project the user has access to works (the account page is user-scoped,
   *  the project ID is just structural). Callers should pass their first
   *  accessible project's ID. */
  fallbackProjectId,
  rider,
  title,
  subtitle,
  /** Optional right-aligned topbar action (typically a "+ New project"). */
  topbarAction,
  children,
}: {
  user: User;
  fallbackProjectId: string;
  rider?: AccountRiderInfo;
  title: string;
  subtitle?: string;
  topbarAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dash">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand side-brand" aria-label="Issuefy dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
        </Link>

        <div className="side-section">
          <div className="side-label">Workspace</div>
          <nav className="side-nav">
            <Link href="/dashboard" className="side-item on">
              <Icon name="DashboardSquare01Icon" size={19} stroke={1.9} />
              <span>All projects</span>
            </Link>
            <Link href="/dashboard/new" className="side-item">
              <Icon name="Add01Icon" size={19} stroke={1.8} />
              <span>New project</span>
            </Link>
          </nav>
        </div>

        <div className="side-foot">
          <ProfileMenu projectId={fallbackProjectId} user={user} rider={rider} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle && (
              <span className="topbar-date">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {subtitle}
              </span>
            )}
          </div>
          {topbarAction && <div className="topbar-right">{topbarAction}</div>}
        </header>
        <div className="main-scroll">{children}</div>
      </main>
    </div>
  );
}
