import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { accountDeletionMode, deleteAccount, AccountDeletionError } from "@/lib/account-deletion";
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

/** DELETE remains callable while pending: requireUser deliberately denies a
 * tombstoned account. Authentication identifies ONLY the caller's own record.
 */
export async function DELETE() {
  try {
    // Before auth/lazy upsert, and before any database/provider mutation.
    accountDeletionMode();
  } catch {
    return json({ error: "Account deletion configuration is invalid.", code: "deletion_environment_invalid" }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!stripe) return json({ error: "Billing is unavailable.", code: "deletion_billing_unavailable" }, { status: 503 });
  try {
    const client = await clerkClient();
    return json(await deleteAccount(userId, stripe, client.users));
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return json({ ok: false, status: "pending", error: error.message, code: error.code }, { status: error.status });
    }
    return json({ ok: false, status: "pending", error: "Account deletion is not complete. Retry or contact support.", code: "deletion_retry" }, { status: 503 });
  }
}
