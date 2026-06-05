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
    <section className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18, background: "var(--surface)", border: "1px solid var(--accent-bg-2)", borderRadius: "var(--r-lg)" }}>
      <header style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: "var(--accent-bg)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Icon name="SparklesIcon" size={20} stroke={1.6} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            Your project is live. Your first brief lands tomorrow morning.
          </h2>
          <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.55 }}>
            Issuefy will run its daily scan around 06:00 UTC and email you the summary{firstCompetitorName ? ` — starting with what's new at ${firstCompetitorName}` : ""}. Or trigger one now to see it sooner.
          </p>
        </div>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
