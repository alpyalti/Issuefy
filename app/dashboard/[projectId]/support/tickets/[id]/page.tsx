import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getTicketMessages, ownedTicket, CATEGORY_LABEL, STATUS_LABEL } from "@/lib/support";
import { Icon } from "@/components/icons/Icon";
import TicketThread from "@/components/support/TicketThread";
import "../../support.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; id: string }> };

export async function generateMetadata({ params }: Ctx) {
  const { id } = await params;
  return { title: `Ticket ${id.slice(0, 6)} — Issuefy support` };
}

export default async function UserTicketPage({ params }: Ctx) {
  const { projectId, id } = await params;
  const user = await getOrCreateUser();
  const ticket = await ownedTicket(user.id, id);
  if (!ticket) notFound();

  const basePath = `/dashboard/${projectId}/support`;
  const messages = await getTicketMessages(id);
  const threadMessages = messages.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    author_type: m.author_type,
    author_label: m.author_type === "admin" ? "Issuefy support" : (user.name?.trim() || "You"),
  }));

  return (
    <div className="page-wrap support-page">
      <header className="support-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
          <Link href={`${basePath}/tickets`} className="support-link" style={{ fontSize: 12.5 }}>
            ← All tickets
          </Link>
          <h1 style={{ fontSize: 28 }}>{ticket.subject}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={"support-chip support-chip-" + ticket.status}>
              {STATUS_LABEL[ticket.status].toUpperCase()}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
              {CATEGORY_LABEL[ticket.category]} · opened {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <Link href={basePath} className="btn btn-ghost">
          <Icon name="HelpCircleIcon" size={15} stroke={1.7} /> Support home
        </Link>
      </header>

      <section className="support-card">
        <TicketThread ticketId={ticket.id} messages={threadMessages} isClosed={ticket.status === "closed"} />
      </section>
    </div>
  );
}
