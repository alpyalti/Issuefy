import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { SUPPORT_FAQ } from "@/lib/support-faq";
import { Icon } from "@/components/icons/Icon";
import NewTicketForm from "@/components/support/NewTicketForm";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Support — Issuefy" };

/**
 * /support — public-ish (auth-gated by middleware) landing page.
 *
 * Three sections:
 *   1. A "Email support@issuefy.app" + "Open a ticket" CTA strip.
 *   2. A new-ticket form (NewTicketForm) — submissions land in admin panel.
 *   3. FAQ accordion (SUPPORT_FAQ from lib/support-faq.ts).
 *
 * Also surfaces a "Your recent tickets" panel at the top when the user has
 * any open / in-flight tickets so they can jump back to a thread without
 * clicking through /support/tickets.
 */
export default async function SupportPage() {
  const user = await getOrCreateUser();
  const sql = requireSql();
  const recent = (await sql`
    SELECT id, subject, status, last_message_at, last_message_by
      FROM support_tickets
     WHERE user_id = ${user.id}
       AND status <> 'closed'
     ORDER BY last_message_at DESC
     LIMIT 5
  `) as Array<{
    id: string; subject: string; status: "open" | "pending" | "resolved" | "closed";
    last_message_at: string; last_message_by: "user" | "admin";
  }>;

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 32 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.08 }}>
            Support.
          </h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}>
            Pick whatever&apos;s easiest — email us, open a tracked ticket below, or skim the FAQ if your question&apos;s common.
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-ghost">
          <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Back to dashboard
        </Link>
      </header>

      {/* Quick-actions strip */}
      <section className="card" style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-bg)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <Icon name="Mail01Icon" size={17} stroke={1.7} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>support@issuefy.app</span>
            <span className="muted" style={{ fontSize: 12.5 }}>We typically reply within one business day.</span>
          </div>
        </div>
        <a className="btn btn-ghost" href={`mailto:support@issuefy.app?subject=${encodeURIComponent("Issuefy support")}`}>
          <Icon name="Mail01Icon" size={15} stroke={1.7} /> Email us
        </a>
      </section>

      {/* Recent open / pending tickets */}
      {recent.length > 0 && (
        <section className="card" style={{ padding: 22 }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Your recent tickets</h2>
            <Link href="/support/tickets" className="auth-link">
              View all →
            </Link>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recent.map((t) => (
              <TicketRow key={t.id} t={t} />
            ))}
          </div>
        </section>
      )}

      <NewTicketForm />

      {/* FAQ */}
      <section className="card" style={{ padding: 22 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 14 }}>Frequently asked</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {SUPPORT_FAQ.map((item) => (
            <details key={item.q} className="faq-item" style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
              <summary style={{ cursor: "pointer", fontFamily: "var(--serif)", fontSize: 16, color: "var(--ink)", letterSpacing: "-0.005em", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span>{item.q}</span>
                <Icon name="ArrowDown01Icon" size={15} stroke={1.7} color="var(--ink-3)" />
              </summary>
              <p style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function TicketRow({ t }: { t: { id: string; subject: string; status: "open" | "pending" | "resolved" | "closed"; last_message_at: string; last_message_by: "user" | "admin" } }) {
  const STATUS_PILL: Record<string, { label: string; bg: string; color: string; border: string }> = {
    open: { label: "Open", bg: "var(--accent-bg)", color: "var(--accent-ink)", border: "var(--accent-bg-2)" },
    pending: { label: "Reply received", bg: "#FFF8E1", color: "#7C4A00", border: "#FFE6A0" },
    resolved: { label: "Resolved", bg: "var(--pos-bg)", color: "var(--pos)", border: "var(--pos-bg)" },
    closed: { label: "Closed", bg: "var(--surface-2)", color: "var(--ink-3)", border: "var(--line)" },
  };
  const pill = STATUS_PILL[t.status];
  const ts = new Date(t.last_message_at);
  return (
    <Link href={`/support/tickets/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, textDecoration: "none", color: "inherit" }}>
      <Icon name="HelpCircleIcon" size={16} stroke={1.7} color="var(--ink-3)" />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {t.subject}
      </span>
      <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: ".06em", background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>
        {pill.label.toUpperCase()}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{ts.toLocaleDateString()}</span>
    </Link>
  );
}
