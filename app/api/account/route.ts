import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, parseJson } from "@/lib/api";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  company_name: z.string().trim().max(120).nullable().optional(),
}).strict().refine(
  (b) => b.name !== undefined || b.company_name !== undefined,
  { message: "Must include at least one field" },
);

/** PATCH /api/account — update profile fields (name, company_name). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseJson(req, patchSchema);
  if (body instanceof Response) return body;
  const sql = requireSql();
  const rows = await sql`
    UPDATE users SET
      name         = COALESCE(${body.name ?? null}, name),
      company_name = COALESCE(${body.company_name ?? null}, company_name),
      updated_at   = now()
    WHERE id = ${user.id}
    RETURNING id, name, company_name
  `;
  return json({ user: rows[0] });
}

/**
 * DELETE /api/account — fully delete the account.
 *
 * Two-phase delete:
 *   1. Delete the row from Postgres — `ON DELETE CASCADE` on every FK to users
 *      cleans up projects, competitors, keywords, sources, signals, daily
 *      summaries, scrape_jobs, usage_counters.
 *   2. Delete the Clerk user via the Backend API. If this fails (network),
 *      we've already removed our DB state — Clerk leak is acceptable
 *      (admin can clean up via Clerk dashboard).
 */
export async function DELETE() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });
  const sql = requireSql();
  await sql`DELETE FROM users WHERE id = ${user.id}`;
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkUserId);
  } catch (e) {
    // Logged but not fatal — DB is the source of truth.
    // eslint-disable-next-line no-console
    console.warn("[account-delete] Clerk delete failed:", e);
  }
  return json({ ok: true });
}
