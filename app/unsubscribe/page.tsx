import Link from "next/link";
import { requireSql } from "@/lib/db";
import { Icon } from "@/components/icons/Icon";
import "../globals.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe page (CAN-SPAM compliant).
 *
 *   GET /unsubscribe?token=<users.email_brief_unsubscribe_token>
 *
 * The token IS the auth — the URL is single-use-ish (regenerated only if the
 * user resubscribes-then-unsubscribes, which we don't bother regenerating in
 * the MVP). Public route — Clerk middleware doesn't gate it.
 *
 * Behavior:
 *   - valid token → flip email_brief_enabled to false, show confirmation
 *   - missing token → friendly "we need a token" message
 *   - invalid token → friendly "couldn't find that subscription" message
 */
type Ctx = { searchParams: Promise<{ token?: string }> };

interface UserBriefRow { id: string; email: string; email_brief_enabled: boolean; }

export default async function UnsubscribePage({ searchParams }: Ctx) {
  const { token } = await searchParams;
  const sql = requireSql();

  if (!token) {
    return <UnsubscribeCard title="Unsubscribe link missing" body="This link doesn't include the unsubscribe token. Use the link from your most recent Issuefy email." />;
  }

  // Look up the user by their token, flip the flag.
  const rows = (await sql`
    UPDATE users
    SET email_brief_enabled = false, updated_at = now()
    WHERE email_brief_unsubscribe_token = ${token}
    RETURNING id, email, email_brief_enabled
  `) as UserBriefRow[];

  if (rows.length === 0) {
    return <UnsubscribeCard title="Subscription not found" body="We couldn't find an active subscription for that link. It may have already been unsubscribed, or the link may be from a very old email." />;
  }

  return (
    <UnsubscribeCard
      title="You're unsubscribed"
      body={`You won't receive any more daily briefs at ${rows[0].email}. You can re-enable them anytime from your Issuefy settings.`}
      showResubscribe
    />
  );
}

function UnsubscribeCard({ title, body, showResubscribe }: { title: string; body: string; showResubscribe?: boolean }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "var(--bg)" }}>
      <div className="card" style={{ maxWidth: 460, padding: 36, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <span style={{ width: 48, height: 48, borderRadius: 12, background: "var(--accent-bg)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="Mail01Icon" size={22} stroke={1.6} />
          </span>
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", marginBottom: 12 }}>{title}</h1>
        <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: 28 }}>{body}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/dashboard" className="btn btn-accent" style={{ justifyContent: "center" }}>Open dashboard</Link>
          {showResubscribe && (
            <Link href="/dashboard" className="btn btn-quiet" style={{ justifyContent: "center", fontSize: 13 }}>
              Or re-enable briefs from settings →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
