import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "./db";
import { sendWelcomeEmail } from "./mailer";

/**
 * Lazy user upsert (PRD §10.4).
 *
 * The first authenticated action that needs `users.id` must call
 * `getOrCreateUser()`. We look up by `clerk_user_id`; if missing, we read the
 * profile from `currentUser()` (default session claims omit email/name) and
 * upsert with `ON CONFLICT … DO UPDATE`, which is idempotent and concurrency-
 * safe against double-click races on first project creation.
 *
 * A new row triggers a single welcome email via Resend.
 */
export interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  plan: string;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getOrCreateUser(): Promise<UserRow> {
  if (!sql) throw new Error("DATABASE_URL is not configured");

  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const existing = (await sql`SELECT * FROM users WHERE clerk_user_id = ${userId} LIMIT 1`) as UserRow[];
  if (existing[0]) return existing[0];

  const cu = await currentUser();
  if (!cu) throw new Error("Clerk currentUser() returned null");
  const email = cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress
    ?? cu.emailAddresses[0]?.emailAddress
    ?? `${userId}@unknown.invalid`;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim() || null;

  const trialEnds = new Date();
  trialEnds.setUTCDate(trialEnds.getUTCDate() + 14);

  // ON CONFLICT … DO UPDATE keeps the upsert idempotent under concurrent first-
  // project-creation races; RETURNING gives us the row back in one round trip.
  const rows = (await sql`
    INSERT INTO users (clerk_user_id, email, name, plan, trial_ends_at)
    VALUES (${userId}, ${email}, ${name}, 'starter', ${trialEnds.toISOString()})
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET email = EXCLUDED.email,
          name  = COALESCE(users.name, EXCLUDED.name),
          updated_at = now()
    RETURNING *
  `) as UserRow[];
  const row = rows[0];

  // Fire-and-forget welcome email; failure must not break sign-up. We only send
  // when the row was actually new (created_at within the last 5 seconds — a
  // reasonable heuristic when DO UPDATE may otherwise resurface old rows).
  const isFresh = Date.now() - new Date(row.created_at).getTime() < 5_000;
  if (isFresh) {
    sendWelcomeEmail(email, name).catch(() => { /* logged inside mailer */ });
  }

  return row;
}

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
  return getOrCreateUser();
}
