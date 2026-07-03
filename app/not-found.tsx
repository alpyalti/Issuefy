import Link from "next/link";

/**
 * Global 404 — branded fallback for any unmatched route. (Dashboard pages
 * already 404 via notFound() and land here too.)
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 14,
        padding: 24, textAlign: "center",
      }}
    >
      <p style={{ fontFamily: "var(--mono, monospace)", fontSize: 13, letterSpacing: "0.08em", color: "var(--ink-3, #888)" }}>404</p>
      <h1 style={{ fontFamily: "var(--serif, serif)", fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
        This page doesn&apos;t exist.
      </h1>
      <p style={{ fontSize: 15, color: "var(--ink-2, #555)", maxWidth: "42ch", margin: 0 }}>
        The link may be old, or the project it pointed at was removed.
      </p>
      <Link
        href="/dashboard"
        style={{
          marginTop: 10, padding: "10px 18px", borderRadius: 10,
          background: "var(--accent, #2D5BE3)", color: "#fff",
          fontSize: 14, fontWeight: 600, textDecoration: "none",
        }}
      >
        Back to your dashboard
      </Link>
    </main>
  );
}
