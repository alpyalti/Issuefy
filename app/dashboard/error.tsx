"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureError } from "@/lib/sentry";

/**
 * Error boundary scoped to /dashboard/**. Lets a thrown error in a project
 * page (settings, account, support, signals, etc.) recover without unmounting
 * the dashboard shell. Reuses the same surface treatment as the root boundary.
 */
export default function DashboardError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { stage: "dashboard.error", digest: error.digest });
  }, [error]);

  return (
    <main
      id="main-content"
      className="page-wrap"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 64 }}
    >
      <div
        className="card"
        style={{
          maxWidth: 460, width: "100%",
          padding: "30px 26px",
          display: "flex", flexDirection: "column", gap: 14, textAlign: "center",
        }}
      >
        <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".14em", textTransform: "uppercase" }}>
          Page error
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          This page failed to load.
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
          We&apos;ve logged the error. Try reloading — if it keeps happening,{" "}
          <Link href="/support" className="auth-link">open a support ticket</Link> and include the reference below.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-4)" }}>
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
          <button className="btn btn-accent" onClick={() => reset()}>Reload</button>
          <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
