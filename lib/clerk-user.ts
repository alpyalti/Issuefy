import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql, withTx } from "./db";
import { sendWelcomeEmail } from "./mailer";

/** Lazy identity sync uses only Clerk's verified primary email. A permanent
 * tombstone denies pending/deleted identities, including concurrent upserts.
 */
export class AccountUnavailableError extends Error {
  constructor(message: string, public status = 410) { super(message); }
}
export interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  plan: string;
  trial_ends_at: string | null;
  email_brief_enabled: boolean;
  email_brief_unsubscribe_token: string;
  created_at: string;
  updated_at: string;
  clerk_profile_updated_at?: number | string;
}

// cache(): the [projectId] layout AND every page call this during the same
// request — without dedupe that's 2× auth() + 2× SELECT users per hard load.
export const getOrCreateUser = cache(async (): Promise<UserRow> => {
  if (!sql) throw new Error("DATABASE_URL is not configured");

  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const blocked = await sql`SELECT 1 FROM account_deletions WHERE clerk_user_id = ${userId}`;
  if (blocked.length) throw new AccountUnavailableError("Account deletion is pending or complete.");
  const cu = await currentUser();
  if (!cu || cu.id !== userId) throw new Error("Clerk identity unavailable");
  const primary = cu.emailAddresses.find(e => e.id === cu.primaryEmailAddressId);
  const email = primary?.verification?.status === "verified" ? primary.emailAddress : null;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim() || null;
  const profileVersion = cu.updatedAt;
  const result = await withTx(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`ify:identity:${userId}`]);
    const tombstone = await client.query("SELECT 1 FROM account_deletions WHERE clerk_user_id = $1", [userId]);
    if (tombstone.rows.length) throw new AccountUnavailableError("Account deletion is pending or complete.");
    const existing = await client.query("SELECT * FROM users WHERE clerk_user_id = $1 FOR UPDATE", [userId]);
    const user = existing.rows[0] as UserRow | undefined;
    if (user) {
      if (email && profileVersion > Number(user.clerk_profile_updated_at ?? 0)) {
        if (user.email !== email) {
          const ambiguous = await client.query(`SELECT 1 FROM billing_notification_outbox WHERE sent_at IS NULL
            AND account_user_id IS NULL AND lower(recipient) = lower($1)
            AND (SELECT count(*) FROM users WHERE lower(email) = lower($1)) > 1 LIMIT 1`, [user.email]);
          if (ambiguous.rows.length) throw new AccountUnavailableError("Email synchronization needs support to reconcile pending notifications.", 503);
          // Do not change an email request's payload while retaining its Resend
          // idempotency key. Suppress stale unsent notices; future events use the
          // new verified email. Already dispatched mail cannot be recalled.
          await client.query(`DELETE FROM billing_notification_outbox WHERE sent_at IS NULL
            AND (account_user_id = $1 OR (account_user_id IS NULL AND lower(recipient) = lower($2)))`, [user.id, user.email]);
        }
        const updated = await client.query(`UPDATE users SET email = $2, clerk_profile_updated_at = $3,
          updated_at = CASE WHEN email <> $2 THEN now() ELSE updated_at END WHERE id = $1 RETURNING *`, [user.id, email, profileVersion]);
        return { row: updated.rows[0] as UserRow, created: false };
      }
      return { row: user, created: false };
    }
    if (!email) throw new AccountUnavailableError("Verify your primary email before continuing.", 403);
    const trialEnds = new Date();
    trialEnds.setUTCDate(trialEnds.getUTCDate() + 14);
    const rows = await client.query(`INSERT INTO users (clerk_user_id, email, name, plan, trial_ends_at, clerk_profile_updated_at)
      VALUES ($1,$2,$3,'starter',$4,$5) RETURNING *`, [userId, email, name, trialEnds.toISOString(), profileVersion]);
    return { row: rows.rows[0] as UserRow, created: true };
  });
  if (result.created) sendWelcomeEmail(result.row.email, result.row.name).catch(() => { /* logged by mailer */ });
  return result.row;
});

/**
 * Convenience for routes that need the user row up front. Throws a typed
 * Response when unauthenticated so route handlers can do:
 *
 *   const user = await requireUser();
 *   if (user instanceof Response) return user;
 */
export async function requireUser(): Promise<UserRow | Response> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  try { return await getOrCreateUser(); }
  catch (error) {
    if (error instanceof AccountUnavailableError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
