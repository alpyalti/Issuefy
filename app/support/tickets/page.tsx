import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { Icon } from "@/components/icons/Icon";
import "../../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your tickets — Issuefy support" };

/**
 * /support/tickets — list every ticket the user has ever opened, newest
 * activity first. Status pill + last-activity timestamp. Closed tickets are
 * included here (unlike on the support landing page).
 */
export default async function TicketsListPage() {
  const user = await getOrCreateUser();
  const sql = requireSql();
  const tickets = (await sql`
    SELECT id, subject, category, status, last_message_at, last_message_by, created_at,
           (SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = support_tickets.id) AS message_count
      FROM support_tickets
     WHERE user_id = ${user.id}
     ORDER BY last_message_at DESC
  `) as Array<{
    id: string; subject: string; category: string;
    status: "open" | "pending" | "resolved" | "closed";
    last_message_at: string; last_message_by: "user" | "admin";
    created_at: string; message_count: number;
  }>;

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 32 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>
            Your tickets.
          </h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>Track open conversations and revisit past ones.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/support" className="btn btn-ghost">
            <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Support
          </Link>
          <Link href="/support#new" className="btn btn-accent">
            <Icon name="Add01Icon" size={15} stroke={2} /> New ticket
          </Link>
        </div>
      </header>

      {tickets.length === 0 ? (
        <section className="card" style={{ padding: 32, textAlign: "center" }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>You haven&apos;t opened any tickets yet.</p>
          <Link href="/support" className="btn btn-accent">Open your first ticket</Link>
        </section>
      ) : (
        <section className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tickets.map((t) => <Row key={t.id} t={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

const STATUS_PILL: Record<string, { label: string; bg: string; color: string; border: string }> = {
  open: { label: "Open", bg: "var(--accent-bg)", color: "var(--accent-ink)", border: "var(--accent-bg-2)" },
  pending: { label: "Reply received", bg: "#FFF8E1", color: "#7C4A00", border: "#FFE6A0" },
  resolved: { label: "Resolved", bg: "var(--pos-bg)", color: "var(--pos)", border: "var(--pos-bg)" },
  closed: { label: "Closed", bg: "var(--surface-2)", color: "var(--ink-3)", border: "var(--line)" },
};

function Row({ t }: { t: { id: string; subject: string; category: string; status: string; last_message_at: string; last_message_by: string; message_count: number } }) {
  const pill = STATUS_PILL[t.status] ?? STATUS_PILL.open;
  const ts = new Date(t.last_message_at);
  return (
    <Link
      href={`/support/tickets/${t.id}`}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10,
        textDecoration: "none", color: "inherit", transition: "border-color .14s, background .14s",
      }}
    >
      <Icon name="HelpCircleIcon" size={17} stroke={1.7} color="var(--ink-3)" />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t.subject}
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          {t.category.toUpperCase()} · {t.message_count} message{t.message_count === 1 ? "" : "s"} · {ts.toLocaleString()}
        </span>
      </span>
      <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: ".06em", background: pill.bg, color: pill.color, border: `1px solid ${pill.border}`, flex: "none" }}>
        {pill.label.toUpperCase()}
      </span>
    </Link>
  );
}
