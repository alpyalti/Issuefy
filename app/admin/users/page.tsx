import { requireSql } from "@/lib/db";
import UsersTable, { type UserListRow } from "@/components/admin/UsersTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const search = (q || "").trim();
  const sql = requireSql();

  const users = (await sql`
    SELECT
      u.id, u.email, u.name, u.plan, u.role, u.trial_ends_at,
      u.subscription_status, u.created_at, u.last_dashboard_visit_at,
      (SELECT COUNT(*)::int FROM projects p WHERE p.user_id = u.id) AS projects
    FROM users u
    WHERE (${search}::text = '' OR u.email ILIKE '%' || ${search} || '%' OR u.name ILIKE '%' || ${search} || '%')
    ORDER BY u.created_at DESC
    LIMIT 100
  `) as unknown as UserListRow[];

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <header>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30 }}>Users</h1>
        <p className="muted" style={{ marginTop: 4 }}>{users.length} shown — newest first.</p>
      </header>
      <UsersTable users={users} initialSearch={search} />
    </div>
  );
}
