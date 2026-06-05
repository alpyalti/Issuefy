"use client";

import { Icon } from "@/components/icons/Icon";

/** Editorial loading card, used on async-route shells while data fetches. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="empty"
      style={{
        padding: "72px 28px",
        borderStyle: "solid",
        borderColor: "var(--line)",
      }}
    >
      <Icon name="Loading03Icon" size={28} stroke={1.6} color="var(--ink-3)" className="spin" />
      <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-3)", letterSpacing: ".04em", textTransform: "uppercase" }}>
        {label}
      </p>
    </div>
  );
}
