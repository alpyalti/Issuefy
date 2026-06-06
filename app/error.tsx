"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureError } from "@/lib/sentry";

/**
 * Root error boundary — renders whenever a server or client component
 * throws an unhandled exception in any route (and a more specific
 * app/.../error.tsx hasn't claimed it). Keeps users out of Next's default
 * dev-style error overlay in production, and gives them a path back.
 *
 * The error is forwarded to Sentry on mount so a real eventId exists when
 * the user opens a ticket about it.
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { stage: "app.error", digest: error.digest });
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, background: "var(--bg)", fontFamily: "var(--sans)",
      }}
    >
      <main
        id="main-content"
        style={{
          maxWidth: 460, width: "100%",
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)", padding: "32px 28px",
          display: "flex", flexDirection: "column", gap: 16, textAlign: "center",
        }}
      >
        <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".14em", textTransform: "uppercase" }}>
          Something went wrong
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--ink)", lineHeight: 1.2 }}>
          We hit a snag.
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
          The page failed to load. Our team has been notified — you can try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".04em" }}>
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          <button className="btn btn-accent" onClick={() => reset()}>Try again</button>
          <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
        </div>
      </main>
    </div>
  );
}
