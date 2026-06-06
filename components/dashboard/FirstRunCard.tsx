"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

/**
 * Shown on a fresh project's dashboard when no signals exist yet. Replaces
 * the passive "Issuefy has not found enough useful market signals yet" text
 * with concrete guidance + a refresh CTA. PRD §13.6 empty-state copy stays
 * for the data-exists-but-empty case; this card is the FIRST-RUN case.
 *
 * Detection logic lives in the page: pass firstRun=true when
 * project.last_scraped_at is null AND signals.length === 0.
 */
export default function FirstRunCard({
  projectId, firstCompetitorName,
}: {
  projectId: string;
  firstCompetitorName?: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  function refreshNow() {
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/refresh`, { method: "POST" });
        if (res.ok) router.refresh();
      } catch {
        /* errors surface via the global refresh banner in DashChrome */
      }
    });
  }

  return (
    <section
      style={{
        padding: "26px 26px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        // Single restrained accent: a thin rule along the top edge.
        boxShadow: "inset 0 2px 0 0 var(--accent)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          Getting started
        </span>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)", lineHeight: 1.2 }}>
          Your project is live. Your first brief lands tomorrow morning.
        </h2>
        <p style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 560 }}>
          Issuefy runs its daily scan around 06:00 UTC and emails you the summary{firstCompetitorName ? ` — starting with what's new at ${firstCompetitorName}` : ""}. Or trigger one now to see it sooner.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn btn-accent"
          onClick={refreshNow}
          disabled={refreshing}
        >
          <Icon name="RefreshIcon" size={16} stroke={1.8} className={refreshing ? "spin" : ""} />
          {refreshing ? "Running…" : "Run my first brief now"}
        </button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          ~60–90 seconds · uses 1 daily refresh
        </span>
      </div>
    </section>
  );
}
