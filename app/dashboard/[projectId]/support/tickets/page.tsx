import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { Icon } from "@/components/icons/Icon";
import "../support.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your tickets — Issuefy support" };

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * /dashboard/[projectId]/support/tickets — every ticket the user has opened,
 * newest activity first, including closed ones (unlike the support landing
 * page which only shows active threads).
 */
export default async function TicketsListPage({ params }: Ctx) {
  const { projectId } = await params;
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

  const basePath = `/dashboard/${projectId}/support`;

  return (
    <div className="page-wrap support-page">
      <header className="support-head">
        <div>
          <h1>Your tickets.</h1>
          <p>Open conversations and past threads, newest activity first.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={basePath} className="btn btn-ghost">
            <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Support
          </Link>
          <Link href={basePath} className="btn btn-accent">
            <Icon name="Add01Icon" size={15} stroke={2} /> New ticket
          </Link>
        </div>
      </header>

      {tickets.length === 0 ? (
        <section className="support-card" style={{ alignItems: "center", textAlign: "center", padding: 36 }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>You haven&apos;t opened any tickets yet.</p>
          <Link href={basePath} className="btn btn-accent">Open your first ticket</Link>
        </section>
      ) : (
        <section className="support-card">
          <div className="support-ticket-list" style={{ gap: 8 }}>
            {tickets.map((t) => <Row key={t.id} t={t} basePath={basePath} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ t, basePath }: {
  t: { id: string; subject: string; category: string; status: "open" | "pending" | "resolved" | "closed"; last_message_at: string; last_message_by: "user" | "admin"; message_count: number };
  basePath: string;
}) {
  return (
    <Link href={`${basePath}/tickets/${t.id}`} className="support-ticket-row" style={{ padding: "12px 14px" }}>
      <Icon name="HelpCircleIcon" size={16} stroke={1.7} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="support-ticket-subject" style={{ fontSize: 14 }}>{t.subject}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)" }}>
          {t.category.toUpperCase()} · {t.message_count} message{t.message_count === 1 ? "" : "s"} · {new Date(t.last_message_at).toLocaleString()}
        </span>
      </span>
      <span className={"support-chip support-chip-" + t.status}>
        {(t.status === "pending" ? "REPLY RECEIVED" : t.status.toUpperCase())}
      </span>
    </Link>
  );
}
