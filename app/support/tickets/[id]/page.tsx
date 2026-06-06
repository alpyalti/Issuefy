import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getTicketMessages, ownedTicket, CATEGORY_LABEL, STATUS_LABEL } from "@/lib/support";
import { Icon } from "@/components/icons/Icon";
import TicketThread from "@/components/support/TicketThread";
import "../../../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const STATUS_PILL: Record<string, { bg: string; color: string; border: string }> = {
  open: { bg: "var(--accent-bg)", color: "var(--accent-ink)", border: "var(--accent-bg-2)" },
  pending: { bg: "#FFF8E1", color: "#7C4A00", border: "#FFE6A0" },
  resolved: { bg: "var(--pos-bg)", color: "var(--pos)", border: "var(--pos-bg)" },
  closed: { bg: "var(--surface-2)", color: "var(--ink-3)", border: "var(--line)" },
};

export async function generateMetadata({ params }: Ctx) {
  const { id } = await params;
  return { title: `Ticket ${id.slice(0, 6)} — Issuefy support` };
}

/**
 * /support/tickets/:id — user view of a single ticket. Shows the conversation
 * thread (TicketThread is the shared component used on the admin side too) and
 * lets the user reply. Closed tickets show the thread read-only.
 */
export default async function UserTicketPage({ params }: Ctx) {
  const { id } = await params;
  const user = await getOrCreateUser();
  const ticket = await ownedTicket(user.id, id);
  if (!ticket) notFound();

  const messages = await getTicketMessages(id);
  const pill = STATUS_PILL[ticket.status] ?? STATUS_PILL.open;
  const threadMessages = messages.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    author_type: m.author_type,
    author_label: m.author_type === "admin" ? "Issuefy support" : (user.name?.trim() || "You"),
  }));

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 32 }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
          <Link href="/support/tickets" className="auth-link" style={{ fontSize: 12.5 }}>
            ← All tickets
          </Link>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
            {ticket.subject}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: ".06em", background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>
              {STATUS_LABEL[ticket.status].toUpperCase()}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {CATEGORY_LABEL[ticket.category]} · opened {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/support" className="btn btn-ghost">
            <Icon name="HelpCircleIcon" size={15} stroke={1.7} /> Support home
          </Link>
        </div>
      </header>

      <section className="card" style={{ padding: 22 }}>
        <TicketThread ticketId={ticket.id} messages={threadMessages} isClosed={ticket.status === "closed"} />
      </section>
    </div>
  );
}
