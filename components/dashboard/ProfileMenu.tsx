"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/icons/Icon";

const HELP_HREF = "mailto:hello@issuefy.app?subject=Issuefy%20support";

interface MenuUser { name: string | null; email: string; initials: string }

/**
 * Shared account actions, reused by the sidebar popover (ProfileMenu) and the
 * mobile drawer rows so the logout / billing logic lives in one place.
 *
 *  - manageSubscription → Stripe Customer Portal; falls back to /upgrade when
 *    the user has no customer yet (portal returns 409) or billing is off (501).
 *  - signOut → clears the Clerk session and returns to the landing page.
 */
export function useAccountActions() {
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);

  const manageSubscription = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (res.ok) {
        const { url } = await res.json();
        if (url) { window.location.href = url; return; }
      }
    } catch {
      /* fall through to the plan picker */
    }
    window.location.href = "/upgrade";
  }, [busy]);

  const signOut = useCallback(() => {
    clerk.signOut({ redirectUrl: "/" });
  }, [clerk]);

  return { manageSubscription, signOut, helpHref: HELP_HREF, busy };
}

/**
 * Bottom-left sidebar profile chip → click opens a dropdown (upward) with
 * Account / Manage subscription / Help / Log out. Replaces the old static
 * chip + scattered sign-out icon. Closes on outside-click and Escape.
 */
export default function ProfileMenu({
  projectId, user,
}: {
  projectId: string;
  user: MenuUser;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { manageSubscription, signOut, helpHref, busy } = useAccountActions();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="profile-wrap" ref={ref}>
      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head">
            <span className="avatar">{user.initials}</span>
            <span className="profile-meta">
              <span className="profile-name">{user.name || user.email}</span>
              {user.name && <span className="profile-menu-email">{user.email}</span>}
            </span>
          </div>
          <div className="profile-menu-sep" />
          <Link
            href={`/dashboard/${projectId}/account`}
            prefetch
            className="profile-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Icon name="UserCircleIcon" size={17} stroke={1.7} /> Account &amp; profile
          </Link>
          <button
            className="profile-menu-item"
            role="menuitem"
            onClick={() => { setOpen(false); manageSubscription(); }}
            disabled={busy}
          >
            <Icon name="CreditCardIcon" size={17} stroke={1.7} /> Manage subscription
          </button>
          <a className="profile-menu-item" role="menuitem" href={helpHref}>
            <Icon name="HelpCircleIcon" size={17} stroke={1.7} /> Help &amp; support
          </a>
          <div className="profile-menu-sep" />
          <button className="profile-menu-item danger" role="menuitem" onClick={signOut}>
            <Icon name="Logout01Icon" size={17} stroke={1.7} /> Log out
          </button>
        </div>
      )}

      <button
        className={"profile profile-trigger " + (open ? "on" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="avatar">{user.initials}</span>
        <span className="profile-meta">
          <span className="profile-name">{user.name || user.email}</span>
          <span className="profile-role">Account &amp; settings</span>
        </span>
        <Icon name="MoreHorizontalIcon" size={18} stroke={1.7} />
      </button>
    </div>
  );
}
