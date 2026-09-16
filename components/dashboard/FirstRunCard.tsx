"use client";

import { useState, useTransition } from "react";
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
  projectId, firstCompetitorName, isRefreshing,
}: {
  projectId: string;
  firstCompetitorName?: string | null;
  /** True when the server reports a manual refresh is already in flight
   *  (derived from the latest durable running job). Survives navigation
   *  so the card stays in its "Running…" state
   *  when the user comes back to the page mid-scrape. */
  isRefreshing?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [localPending, startRefresh] = useTransition();
  // OR the local POST being in-flight with the server-derived "refresh in
  // progress" flag — that's what keeps the button disabled / spinner showing
  // after a navigation round trip.
  const running = localPending || !!isRefreshing;

  function refreshNow() {
    if (running) return;
    setError(null);
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/refresh`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error || "Could not queue scan");
        window.dispatchEvent(new Event("scan-queued"));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not queue scan");
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
      {error && <p role="alert">{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          {running ? "Working on it" : "Getting started"}
        </span>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)", lineHeight: 1.2 }}>
          {running
            ? "Building your first brief now."
            : "Your project is ready for its first scan."}
        </h2>
        <p style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 560 }}>
          {running
            ? <>Scanning your sources{firstCompetitorName ? ` — starting with ${firstCompetitorName}` : ""}. This usually takes 60&ndash;90 seconds. You can navigate around; the dashboard will refresh on its own when it&apos;s ready.</>
            : <>Daily monitoring runs while your subscription is active. Email delivery follows your notification settings. Run a scan now to look for your first signals{firstCompetitorName ? `, starting with ${firstCompetitorName}` : ""}.</>}
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn btn-accent"
          onClick={refreshNow}
          disabled={running}
        >
          <Icon name="RefreshIcon" size={16} stroke={1.8} className={running ? "spin" : ""} />
          {running ? "Running…" : "Run my first brief now"}
        </button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          {running ? "Don't refresh — we'll update this page when it's done." : "~60–90 seconds · uses 1 daily refresh"}
        </span>
      </div>
    </section>
  );
}
