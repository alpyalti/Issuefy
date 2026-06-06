import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/support";
import { Icon } from "@/components/icons/Icon";
import SupportFilterBar from "@/components/admin/SupportFilterBar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Support · Admin — Issuefy" };

type SearchParams = Promise<{ status?: string; priority?: string; q?: string }>;

/**
 * /admin/support — admin ticket queue with filters.
 *
 * Default view hides closed; explicit ?status=closed shows them.
 * Sorted by priority (urgent → low), status (open → closed), then
 * last_message_at DESC so the urgent / freshly-replied ones float to the top.
 */
export default async function AdminSupportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const sql = requireSql();

  const status = sp.status ?? null;
  const priority = sp.priority ?? null;
  const q = sp.q?.trim().toLowerCase() ?? "";

  const rows = (await sql`
    SELECT t.id, t.subject, t.category, t.priority, t.status,
           t.last_message_at, t.last_message_by, t.created_at,
           u.email AS user_email, u.name AS user_name, u.plan AS user_plan,
           (SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = t.id) AS message_count
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
     WHERE (${status}::text IS NULL OR t.status = ${status}::text)
       AND (${priority}::text IS NULL OR t.priority = ${priority}::text)
       AND (${q}::text = '' OR LOWER(t.subject) LIKE '%' || ${q}::text || '%')
       AND (${status}::text IS NOT NULL OR t.status <> 'closed')
     ORDER BY
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
       t.last_message_at DESC
     LIMIT 200
  `) as Array<{
    id: string; subject: string; category: keyof typeof CATEGORY_LABEL;
    priority: keyof typeof PRIORITY_LABEL; status: keyof typeof STATUS_LABEL;
    last_message_at: string; last_message_by: "user" | "admin"; created_at: string;
    user_email: string; user_name: string | null; user_plan: string;
    message_count: number;
  }>;

  const summary = (await sql`
    SELECT status, COUNT(*)::int AS n FROM support_tickets GROUP BY status
  `) as Array<{ status: string; n: number }>;

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 30 }}>Support queue</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {rows.length} {rows.length === 1 ? "ticket" : "tickets"} matching filters
            {summary.length > 0 && (
              <> · {summary.map((s) => `${s.status}: ${s.n}`).join(" · ")}</>
            )}
          </p>
        </div>
        <Link href="/admin" className="btn btn-ghost">
          <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Admin home
        </Link>
      </header>

      <SupportFilterBar initialStatus={status} initialPriority={priority} initialQ={q} />

      {rows.length === 0 ? (
        <section className="card" style={{ padding: 32, textAlign: "center" }}>
          <p className="muted" style={{ fontSize: 14 }}>Nothing matches these filters.</p>
        </section>
      ) : (
        <section className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.map((t) => <AdminRow key={t.id} t={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

const STATUS_PILL: Record<string, { bg: string; color: string; border: string }> = {
  open: { bg: "var(--accent-bg)", color: "var(--accent-ink)", border: "var(--accent-bg-2)" },
  pending: { bg: "#FFF8E1", color: "#7C4A00", border: "#FFE6A0" },
  resolved: { bg: "var(--pos-bg)", color: "var(--pos)", border: "var(--pos-bg)" },
  closed: { bg: "var(--surface-2)", color: "var(--ink-3)", border: "var(--line)" },
};
const PRIORITY_PILL: Record<string, { bg: string; color: string; border: string }> = {
  urgent: { bg: "var(--neg-bg)", color: "var(--neg)", border: "var(--neg-line)" },
  high: { bg: "#FFF1E1", color: "#A03A00", border: "#FFD3AC" },
  normal: { bg: "var(--surface-2)", color: "var(--ink-2)", border: "var(--line)" },
  low: { bg: "var(--surface-2)", color: "var(--ink-3)", border: "var(--line)" },
};

function AdminRow({ t }: {
  t: {
    id: string; subject: string; category: keyof typeof CATEGORY_LABEL;
    priority: keyof typeof PRIORITY_LABEL; status: keyof typeof STATUS_LABEL;
    last_message_at: string; last_message_by: "user" | "admin";
    user_email: string; user_name: string | null; user_plan: string;
    message_count: number;
  };
}) {
  const sp = STATUS_PILL[t.status] ?? STATUS_PILL.open;
  const pp = PRIORITY_PILL[t.priority] ?? PRIORITY_PILL.normal;
  const reqLabel = t.user_name?.trim() || t.user_email;
  return (
    <Link
      href={`/admin/support/${t.id}`}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10,
        textDecoration: "none", color: "inherit", background: "var(--surface)",
      }}
    >
      <span style={{ padding: "2px 7px", borderRadius: 999, fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", background: pp.bg, color: pp.color, border: `1px solid ${pp.border}`, flex: "none" }}>
        {PRIORITY_LABEL[t.priority].toUpperCase()}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t.subject}
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          {CATEGORY_LABEL[t.category]} · {reqLabel} ({t.user_plan}) · {t.message_count} msg · {new Date(t.last_message_at).toLocaleString()}{t.last_message_by === "user" ? " (user)" : " (admin)"}
        </span>
      </span>
      <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: ".06em", background: sp.bg, color: sp.color, border: `1px solid ${sp.border}`, flex: "none" }}>
        {STATUS_LABEL[t.status].toUpperCase()}
      </span>
    </Link>
  );
}
