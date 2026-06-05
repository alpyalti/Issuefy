"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/icons/Icon";
import { useDashboardView } from "./dashboard-view-context";

/**
 * Topbar notification bell.
 *
 * Badge count = signals created in the last 24h that aren't dismissed
 * (computed server-side in the layout via `getNewSignalCount`). Clicking the
 * bell opens a tiny dropdown explaining "X new signals today" with a "View
 * latest" CTA that jumps to the Today view via the existing view context.
 */
export default function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { setView } = useDashboardView();

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
    <div className="bell-wrap" ref={ref}>
      <button
        className="icon-btn lg"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `${unread} new signal${unread === 1 ? "" : "s"}` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="Notification01Icon" size={19} stroke={1.6} />
        {unread > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Notifications">
          <div className="bell-pop-head">
            <h4 style={{ fontSize: 14, fontWeight: 600 }}>Notifications</h4>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".04em" }}>Last 24h</span>
          </div>
          {unread > 0 ? (
            <>
              <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
                <b style={{ color: "var(--ink)" }}>{unread} new signal{unread === 1 ? "" : "s"}</b> surfaced in the last 24 hours.
              </p>
              <button
                className="btn btn-accent btn-sm"
                style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                onClick={() => { setView("today"); setOpen(false); }}
              >
                View today&apos;s brief
              </button>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>
              All caught up. New signals show up here when the daily scan finds something.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
