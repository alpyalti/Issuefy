import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { SUPPORT_FAQ } from "@/lib/support-faq";
import { Icon } from "@/components/icons/Icon";
import NewTicketForm from "@/components/support/NewTicketForm";
import "./support.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Support — Issuefy" };

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * /dashboard/[projectId]/support — support landing inside the dashboard shell.
 *
 * Two-column layout:
 *   - Left:  "Open a ticket" form (NewTicketForm) and (when present) recent
 *            tickets the user can jump back into.
 *   - Right: SLA card ("We typically reply within 24 hours"),
 *            an Email-us card,
 *            and the FAQ accordion sourced from lib/support-faq.ts.
 *
 * The top-level /support route redirects here using the user's primary
 * project so email links stay stable across renames + plan changes.
 */
export default async function SupportPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();
  const recent = (await sql`
    SELECT id, subject, status, last_message_at, last_message_by
      FROM support_tickets
     WHERE user_id = ${user.id}
       AND status <> 'closed'
     ORDER BY last_message_at DESC
     LIMIT 4
  `) as Array<{
    id: string; subject: string;
    status: "open" | "pending" | "resolved" | "closed";
    last_message_at: string; last_message_by: "user" | "admin";
  }>;

  const basePath = `/dashboard/${projectId}/support`;

  return (
    <div className="page-wrap support-page">
      <header className="support-head">
        <div>
          <h1>Support.</h1>
          <p>Pick whatever&apos;s easiest — open a tracked ticket, email us, or skim the FAQ for common questions.</p>
        </div>
        {recent.length > 0 && (
          <Link href={`${basePath}/tickets`} className="btn btn-ghost">
            <Icon name="LinkSquare02Icon" size={15} stroke={1.7} /> All tickets
          </Link>
        )}
      </header>

      <div className="support-grid">
        {/* ── Left column ───────────────────────────────────────── */}
        <div className="support-col">
          {recent.length > 0 && (
            <section className="support-card">
              <header className="support-card-head">
                <h2>Your open tickets</h2>
                <Link href={`${basePath}/tickets`} className="support-link">View all →</Link>
              </header>
              <div className="support-ticket-list">
                {recent.map((t) => (
                  <Link key={t.id} href={`${basePath}/tickets/${t.id}`} className="support-ticket-row">
                    <Icon name="HelpCircleIcon" size={15} stroke={1.7} />
                    <span className="support-ticket-subject">{t.subject}</span>
                    <StatusChip status={t.status} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="support-card">
            <header className="support-card-head">
              <h2>Open a ticket</h2>
              <p>Tell us what&apos;s going on — we&apos;ll reply by email and the thread stays here.</p>
            </header>
            <NewTicketForm basePath={basePath} />
          </section>
        </div>

        {/* ── Right column ──────────────────────────────────────── */}
        <div className="support-col support-col-right">
          {/* SLA card */}
          <section className="support-card support-sla">
            <span className="support-sla-mark">
              <Icon name="CheckmarkBadge01Icon" size={18} stroke={1.7} color="#fff" />
            </span>
            <h3>We typically reply within 24 hours.</h3>
            <p>Faster on bugs, billing, and account issues. You&apos;ll get an email when we respond, and the full thread lives on this page.</p>
          </section>

          {/* Email card */}
          <section className="support-card support-email">
            <div className="support-email-meta">
              <p className="support-card-eyebrow">Prefer email?</p>
              <p className="support-email-addr">support@issuefy.app</p>
            </div>
            <a
              className="btn btn-accent support-email-btn"
              href={`mailto:support@issuefy.app?subject=${encodeURIComponent(`Issuefy support — ${user.email}`)}`}
            >
              <Icon name="Mail01Icon" size={15} stroke={1.8} /> Email support
            </a>
          </section>

          {/* FAQ */}
          <section className="support-card">
            <header className="support-card-head">
              <h2>Frequently asked</h2>
            </header>
            <div className="support-faq">
              {SUPPORT_FAQ.map((item) => (
                <details key={item.q} className="support-faq-item">
                  <summary>
                    <span>{item.q}</span>
                    <Icon name="ArrowDown01Icon" size={14} stroke={1.7} />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: "open" | "pending" | "resolved" | "closed" }) {
  const LABEL: Record<string, string> = {
    open: "OPEN", pending: "REPLY RECEIVED", resolved: "RESOLVED", closed: "CLOSED",
  };
  return <span className={"support-chip support-chip-" + status}>{LABEL[status]}</span>;
}
