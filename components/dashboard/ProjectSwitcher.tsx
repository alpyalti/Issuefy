"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

/**
 * Dropdown above the sidebar brand mark — lists every project the user owns.
 * Current project bolded. Clicking another project navigates to its dashboard
 * (real route; the layout re-fetches that project's data automatically).
 *
 * Hidden when the user only owns one project (the switcher would be noise).
 */
interface Project { id: string; name: string; company_name: string | null; }

export default function ProjectSwitcher({
  current, projects,
}: {
  current: { id: string; name: string };
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

  // Hide the switcher entirely if the user only owns one project.
  if (projects.length <= 1) return null;

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
        <Icon name={open ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={14} stroke={1.8} />
      </button>
      {open && (
        <div className="proj-switch-menu" role="listbox">
          {projects.map((p) => {
            const isCurrent = p.id === current.id;
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
                {isCurrent && <Icon name="Tick02Icon" size={15} stroke={2} />}
              </Link>
            );
          })}
          <Link href="/dashboard" className="proj-switch-item proj-switch-foot" onClick={() => setOpen(false)}>
            <Icon name="PlusSignIcon" size={14} stroke={1.9} />
            <span>All projects</span>
          </Link>
        </div>
      )}
    </div>
  );
}
