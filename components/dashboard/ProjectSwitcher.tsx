"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

/**
 * Project switcher in the dashboard sidebar — always visible, even for users
 * with a single project (Teams Phase 2). The dropdown lets the user pick
 * another project they own OR are an editor / viewer on, and offers a
 * "+ New project" footer that routes through /dashboard/new (which handles
 * plan-limit checks before opening the onboarding wizard).
 *
 * Non-owner projects show a small role chip (EDITOR / VIEWER) so the user
 * can tell at a glance whose project they're in.
 */
interface Project {
  id: string;
  name: string;
  company_name: string | null;
  role?: "owner" | "editor" | "viewer";
}

export default function ProjectSwitcher({
  current, currentRole, projects,
}: {
  current: { id: string; name: string };
  /** Caller's role on the currently-open project — shown as a chip when not owner. */
  currentRole?: "owner" | "editor" | "viewer";
  projects: Project[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="proj-switch" ref={ref}>
      <button
        className="proj-switch-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch project"
      >
        <span className="proj-switch-name">{current.name}</span>
        {currentRole && currentRole !== "owner" && (
          <span className={"proj-role-chip role-" + currentRole}>{currentRole.toUpperCase()}</span>
        )}
        <Icon name={open ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={14} stroke={1.8} />
      </button>
      {open && (
        <div className="proj-switch-menu" role="listbox">
          {projects.map((p) => {
            const isCurrent = p.id === current.id;
            const showRole = p.role && p.role !== "owner";
            return (
              <Link
                key={p.id}
                href={`/dashboard/${p.id}`}
                className={"proj-switch-item " + (isCurrent ? "on" : "")}
                role="option"
                aria-selected={isCurrent}
                onClick={() => setOpen(false)}
                prefetch
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="proj-switch-item-name">{p.name}</span>
                  {p.company_name && <span className="proj-switch-item-sub">{p.company_name}</span>}
                </span>
                {showRole && <span className={"proj-role-chip role-" + p.role}>{p.role!.toUpperCase()}</span>}
                {isCurrent && <Icon name="Tick02Icon" size={15} stroke={2} />}
              </Link>
            );
          })}
          <Link
            href="/dashboard/new"
            className="proj-switch-item proj-switch-foot"
            onClick={() => setOpen(false)}
          >
            <Icon name="Add01Icon" size={14} stroke={1.9} />
            <span>New project</span>
          </Link>
          {projects.length > 1 && (
            <Link
              href="/dashboard"
              className="proj-switch-item proj-switch-foot"
              onClick={() => setOpen(false)}
            >
              <Icon name="DashboardSquare01Icon" size={14} stroke={1.6} />
              <span>All projects</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
