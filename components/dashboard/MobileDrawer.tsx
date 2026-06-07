"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { useAccountActions, type AccountRiderInfo } from "./ProfileMenu";

/**
 * Mobile slide-in drawer holding the watchlist + profile.
 *
 * Opened from a hamburger in the topbar (visible only on mobile). Closes on:
 *   - tap outside the panel (backdrop)
 *   - tap of any link inside (so Settings actually navigates)
 *   - Escape key
 */
interface Competitor { id: string; name: string; is_active: boolean; }
interface Keyword { id: string; keyword: string; is_active: boolean; }
interface AccessibleProject {
  id: string;
  name: string;
  company_name: string | null;
  role: "owner" | "editor" | "viewer";
}

export default function MobileDrawer({
  open, onClose, projectId, projectName, userName, competitors, keywords, initials,
  projects = [], rider,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  userName: string;
  competitors: Competitor[];
  keywords: Keyword[];
  initials: string;
  /** Every project the user can access — owned + member. Drives the
   *  drawer's project switcher (Teams Phase 2). */
  projects?: AccessibleProject[];
  /** Rider-billing info — pass-through so "Manage subscription" alerts
   *  rider-only users instead of trying to open the Stripe portal. */
  rider?: AccountRiderInfo;
}) {
  const { manageSubscription, signOut, helpHref, busy } = useAccountActions(rider);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden"; // prevent background scroll while open
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mobile-drawer-overlay" onClick={onClose}>
      <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()} aria-label="Project menu">
        <header className="mobile-drawer-head">
          <Link href="/dashboard" className="brand" onClick={onClose} aria-label="Issuefy dashboard">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
          </Link>
          <button className="mobile-drawer-close" onClick={onClose} aria-label="Close menu">
            <Icon name="Cancel01Icon" size={20} stroke={1.7} />
          </button>
        </header>

        <div className="mobile-drawer-body">
          {/* Project switcher — top of the drawer. Lists every project the user
              can access, with role chip for non-owner ones, plus a "New project"
              row at the bottom. */}
          {projects.length > 0 && (
            <section className="side-section" style={{ flex: "initial" }}>
              <div className="side-label">Projects</div>
              <div className="mobile-drawer-projects">
                {projects.map((p) => {
                  const isCurrent = p.id === projectId;
                  return (
                    <Link
                      key={p.id}
                      href={`/dashboard/${p.id}`}
                      onClick={onClose}
                      className={"mobile-drawer-project " + (isCurrent ? "on" : "")}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="mobile-drawer-project-name">{p.name}</span>
                        {p.company_name && <span className="mobile-drawer-project-sub">{p.company_name}</span>}
                      </span>
                      {p.role !== "owner" && (
                        <span className={"proj-role-chip role-" + p.role}>{p.role.toUpperCase()}</span>
                      )}
                      {isCurrent && <Icon name="Tick02Icon" size={15} stroke={2} />}
                    </Link>
                  );
                })}
                <Link href="/dashboard/new" onClick={onClose} className="mobile-drawer-project new">
                  <Icon name="Add01Icon" size={14} stroke={1.9} />
                  <span>New project</span>
                </Link>
              </div>
            </section>
          )}

          <section className="side-section side-watch" style={{ flex: "initial" }}>
            <div className="side-label">Watchlist</div>
            <div className="watchlist">
              {competitors.length > 0 && <div className="watch-group">Competitors</div>}
              {competitors.map((c) => (
                <Link
                  href={`/dashboard/${projectId}/settings`}
                  onClick={onClose}
                  className="watch-item"
                  key={"c-" + c.id}
                >
                  <span className={"watch-live " + (c.is_active ? "on" : "")} />
                  <span className="watch-label">{c.name}</span>
                </Link>
              ))}
              {keywords.length > 0 && <div className="watch-group">Keywords</div>}
              {keywords.map((k) => (
                <Link
                  href={`/dashboard/${projectId}/settings`}
                  onClick={onClose}
                  className="watch-item"
                  key={"k-" + k.id}
                >
                  <span className={"watch-live " + (k.is_active ? "on" : "")} />
                  <span className="watch-label">{k.keyword}</span>
                </Link>
              ))}
              <Link href={`/dashboard/${projectId}/settings`} className="watch-add" onClick={onClose}>
                <Icon name="Settings01Icon" size={15} stroke={1.8} /> Project settings
              </Link>
            </div>
          </section>
        </div>

        <footer className="mobile-drawer-foot">
          <Link href={`/dashboard/${projectId}/account`} className="profile" onClick={onClose}>
            <span className="avatar">{initials}</span>
            <span className="profile-meta">
              <span className="profile-name">{userName}</span>
              <span className="profile-role">{projectName}</span>
            </span>
            <Icon name="ArrowRight01Icon" size={16} stroke={1.7} />
          </Link>
          <div className="mobile-drawer-actions">
            <button
              className="mobile-drawer-action"
              onClick={() => { onClose(); manageSubscription(); }}
              disabled={busy}
            >
              <Icon name="CreditCardIcon" size={17} stroke={1.7} /> Manage subscription
            </button>
            <a className="mobile-drawer-action" href={helpHref}>
              <Icon name="HelpCircleIcon" size={17} stroke={1.7} /> Help &amp; support
            </a>
            <button className="mobile-drawer-action danger" onClick={signOut}>
              <Icon name="Logout01Icon" size={17} stroke={1.7} /> Log out
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
