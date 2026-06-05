"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

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

export default function MobileDrawer({
  open, onClose, projectId, projectName, userName, competitors, keywords, initials,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  userName: string;
  competitors: Competitor[];
  keywords: Keyword[];
  initials: string;
}) {
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
          <Link href="/" className="brand" onClick={onClose} aria-label="Issuefy home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
          </Link>
          <button className="mobile-drawer-close" onClick={onClose} aria-label="Close menu">
            <Icon name="Cancel01Icon" size={20} stroke={1.7} />
          </button>
        </header>

        <div className="mobile-drawer-body">
          <section className="side-section side-watch" style={{ flex: "initial" }}>
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
              <Link href={`/dashboard/${projectId}/settings`} className="watch-add" onClick={onClose}>
                <Icon name="PlusSignIcon" size={15} stroke={1.9} /> Manage watchlist
              </Link>
            </div>
          </section>
        </div>

        <footer className="mobile-drawer-foot">
          <Link href={`/dashboard/${projectId}/settings`} className="profile" onClick={onClose}>
            <span className="avatar">{initials}</span>
            <span className="profile-meta">
              <span className="profile-name">{userName}</span>
              <span className="profile-role">{projectName}</span>
            </span>
            <Icon name="Settings01Icon" size={17} stroke={1.6} />
          </Link>
        </footer>
      </aside>
    </div>
  );
}
