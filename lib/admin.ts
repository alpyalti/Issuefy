import { notFound } from "next/navigation";
import { getOrCreateUser, type UserRow } from "./clerk-user";
import { requireSql } from "./db";

/**
 * Admin authorization helper.
 *
 * Returns the user row when the caller is an admin. Otherwise throws
 * Next.js's notFound() (renders a 404 page) instead of returning 403 —
 * non-admins shouldn't even be able to enumerate the admin surface.
 *
 * Reads `users.role` directly so we don't depend on Clerk metadata round
 * trips. The column was added by migrations/0006_admin.sql.
 */
export interface AdminUserRow extends UserRow {
  role: string;
}

export async function requireAdmin(): Promise<AdminUserRow> {
  const user = await getOrCreateUser();
  const sql = requireSql();
  const rows = (await sql`SELECT role FROM users WHERE id = ${user.id} LIMIT 1`) as Array<{ role: string }>;
  const role = rows[0]?.role ?? "user";
  if (role !== "admin") notFound();
  return { ...user, role };
}

/** Same as requireAdmin but returns a 404 Response (for API routes). */
export async function requireAdminApi(): Promise<AdminUserRow | Response> {
  try {
    const user = await getOrCreateUser();
    const sql = requireSql();
    const rows = (await sql`SELECT role FROM users WHERE id = ${user.id} LIMIT 1`) as Array<{ role: string }>;
    const role = rows[0]?.role ?? "user";
    if (role !== "admin") return new Response("Not found", { status: 404 });
    return { ...user, role };
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
