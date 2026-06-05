"use client";

import { Icon } from "@/components/icons/Icon";

/**
 * Soft error card matching the prototype design language. Use for inline
 * recoverable failures (a scrape failed, AI couldn't summarize). PRD §24 lists
 * the canonical copy strings, exported below as ERROR_MESSAGES.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      className="empty"
      style={{
        padding: "48px 24px",
        borderColor: "var(--neg-line)",
        background: "var(--neg-bg)",
        color: "var(--neg)",
      }}
    >
      <Icon name="Alert02Icon" size={28} stroke={1.5} color="var(--neg)" />
      <p style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--neg)", textAlign: "center", maxWidth: 380, lineHeight: 1.4 }}>
        {message}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ghost" style={{ marginTop: 4 }}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** PRD §24 error copy, verbatim. */
export const ERROR_MESSAGES = {
  SCRAPE_FAILED: "Some sources could not be checked. Issuefy will try again during the next refresh.",
  NO_USEFUL_SIGNALS: "No strong market signals were found from the latest sources.",
  AI_FAILED: "The AI summary could not be generated right now. Please try refreshing later.",
  REFRESH_HOURLY: "You can refresh this project once per hour.",
  REFRESH_DAILY: "You've used all your refreshes for today.",
  PLAN_LIMIT: "You've reached your plan's monthly limit. Upgrade to keep monitoring.",
} as const;
