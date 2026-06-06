import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { adminTicket, getTicketMessages, CATEGORY_LABEL, STATUS_LABEL } from "@/lib/support";
import { Icon } from "@/components/icons/Icon";
import TicketThread from "@/components/support/TicketThread";
import AdminTicketControls from "@/components/admin/AdminTicketControls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Ctx) {
  const { id } = await params;
  return { title: `Ticket ${id.slice(0, 6)} · Admin — Issuefy` };
}

/**
 * /admin/support/:id — admin view of a single ticket. Shows the full thread,
 * the requester's details (email, plan), and exposes status + priority
 * controls plus an admin reply form. Reusing the same TicketThread component
 * the user side uses; we just point its replyEndpoint at the admin API.
 */
export default async function AdminTicketPage({ params }: Ctx) {
  await requireAdmin();
  const { id } = await params;
  const ticket = await adminTicket(id);
  if (!ticket) notFound();

  const sql = requireSql();
  const userRows = (await sql`
    SELECT email, name, plan, subscription_status, created_at
      FROM users WHERE id = ${ticket.user_id} LIMIT 1
  `) as Array<{ email: string; name: string | null; plan: string; subscription_status: string | null; created_at: string }>;
  const requester = userRows[0];

  const messages = await getTicketMessages(id);
  const threadMessages = messages.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    author_type: m.author_type,
    author_label: m.author_type === "admin" ? "You (admin)" : (requester?.name?.trim() || requester?.email || "User"),
  }));

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
          <Link href="/admin/support" className="auth-link" style={{ fontSize: 12.5 }}>
            ← Support queue
          </Link>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
            {ticket.subject}
          </h1>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {CATEGORY_LABEL[ticket.category]} · {STATUS_LABEL[ticket.status]} · opened {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
      </header>

      {/* Requester card */}
      {requester && (
        <section className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--ink)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>
              {((requester.name || requester.email).split(/\s|@/).filter(Boolean).slice(0,2).map((p) => p[0]).join("") || "U").toUpperCase()}
            </span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{requester.name?.trim() || requester.email}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {requester.email} · plan: {requester.plan} · sub: {requester.subscription_status ?? "none"} · joined {new Date(requester.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <a href={`mailto:${requester.email}?subject=${encodeURIComponent(`Re: ${ticket.subject}`)}`} className="btn btn-ghost btn-sm">
            <Icon name="Mail01Icon" size={14} stroke={1.7} /> Reply by email
          </a>
        </section>
      )}

      {/* Controls */}
      <section className="card" style={{ padding: 16 }}>
        <AdminTicketControls
          ticketId={ticket.id}
          status={ticket.status}
          priority={ticket.priority}
        />
      </section>

      {/* Thread + admin reply */}
      <section className="card" style={{ padding: 22 }}>
        <TicketThread
          ticketId={ticket.id}
          messages={threadMessages}
          isClosed={ticket.status === "closed"}
          replyEndpoint={`/api/admin/support/tickets/${encodeURIComponent(ticket.id)}/messages`}
        />
      </section>
    </div>
  );
}
