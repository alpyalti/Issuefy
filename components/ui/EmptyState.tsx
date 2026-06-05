"use client";

import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";

/**
 * Visual empty-state card matching the prototype's `.empty` rule + the
 * editorial design language. Used for the four PRD §19 empty states plus the
 * §13.6 daily-summary empty state. Exact copy is centralized in
 * EMPTY_STATES below.
 */
export interface EmptyStateProps {
  icon: IconName;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, message, ctaLabel, ctaHref, onCta }: EmptyStateProps) {
  return (
    <div
      className="empty"
      style={{
        // Slightly more generous than the in-feed `.empty` (which is 60×20)
        // so this also reads as a top-level page state.
        padding: "72px 28px",
      }}
    >
      <Icon name={icon} size={32} stroke={1.4} color="var(--ink-3)" />
      <p style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink-2)", textAlign: "center", maxWidth: 360, lineHeight: 1.4 }}>
        {message}
      </p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="btn btn-accent" style={{ marginTop: 4 }}>
          {ctaLabel}
        </Link>
      )}
      {ctaLabel && onCta && !ctaHref && (
        <button onClick={onCta} className="btn btn-accent" style={{ marginTop: 4 }}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

/** PRD §19 empty-state copy, verbatim. */
export const EMPTY_STATES = {
  NO_PROJECT: {
    icon: "DashboardSquare01Icon" as IconName,
    message: "Create your first project to start monitoring your market.",
    ctaLabel: "Create Project",
    ctaHref: "/onboarding",
  },
  NO_COMPETITORS: {
    icon: "Target01Icon" as IconName,
    message: "Add competitor websites to track their updates and market positioning.",
    ctaLabel: "Add Competitor",
  },
  NO_KEYWORDS: {
    icon: "Tag01Icon" as IconName,
    message: "Add keywords to monitor market trends, risks, and customer needs.",
    ctaLabel: "Add Keywords",
  },
  NO_SIGNALS_YET: {
    icon: "FlashIcon" as IconName,
    message: "Issuefy has not found enough useful market signals yet. Add more competitors or keywords, or run a refresh.",
    ctaLabel: "Refresh Data",
  },
} as const;

/** PRD §13.6 — empty summary copy. */
export const EMPTY_SUMMARY_MESSAGE =
  "Issuefy has not found enough useful market signals yet. Add more competitors or keywords, or run a refresh.";
