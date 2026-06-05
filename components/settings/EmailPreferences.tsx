"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons/Icon";

/**
 * Daily-brief email toggle on the settings page.
 *
 * Optimistic update: flip the visual state immediately, send the PATCH, revert
 * on failure. Same pattern as the competitor pause toggle in SettingsClient.
 */
export default function EmailPreferences({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTx] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaveStatus("idle");
    startTx(async () => {
      try {
        const res = await fetch("/api/email-preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email_brief_enabled: next }),
        });
        if (!res.ok) throw new Error("save failed");
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1_500);
      } catch {
        setEnabled(!next); // revert
        setSaveStatus("error");
      }
    });
  }

  return (
    <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Daily brief email</h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5, maxWidth: 460 }}>
            Get the AI summary in your inbox every morning at around 6:00 UTC, alongside the dashboard.
            The email matches what you&apos;d see on the dashboard, with one-click access to verify each cited source.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? "Disable daily brief email" : "Enable daily brief email"}
          onClick={toggle}
          disabled={pending}
          style={{
            position: "relative",
            width: 48,
            height: 28,
            borderRadius: 999,
            border: "none",
            background: enabled ? "var(--accent)" : "var(--line-strong)",
            cursor: pending ? "wait" : "pointer",
            transition: "background .18s ease",
            flex: "none",
            padding: 0,
          }}
        >
          <span style={{
            position: "absolute",
            top: 3,
            left: enabled ? 23 : 3,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(21,23,26,.18)",
            transition: "left .18s ease",
          }} />
        </button>
      </header>

      <footer style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
        <Icon name={enabled ? "CheckmarkBadge01Icon" : "Bookmark01Icon"} size={14} stroke={1.7} color={enabled ? "var(--pos)" : "var(--ink-3)"} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          {enabled ? "You'll receive the next brief by email" : "You'll only see the brief on the dashboard"}
        </span>
        {saveStatus === "saved" && <span className="mono" style={{ fontSize: 12, color: "var(--pos)", marginLeft: "auto" }}>✓ Saved</span>}
        {saveStatus === "error" && <span className="mono" style={{ fontSize: 12, color: "var(--neg)", marginLeft: "auto" }}>Couldn&apos;t save — try again</span>}
      </footer>
    </section>
  );
}
