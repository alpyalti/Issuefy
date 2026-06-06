import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

/**
 * Subscription statuses considered "active" for app access. We allow:
 *   - trialing  → user is in the 14-day Starter trial (card on file)
 *   - active    → paying subscriber
 *   - past_due  → payment failed but Stripe is retrying (grace period)
 *   - paused    → temporarily paused via the Customer Portal
 *
 * Blocked: canceled, incomplete, incomplete_expired, or null (never subscribed)
 * — those users get sent to /upgrade?required=1 to start (or restart) a plan.
 */
const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due", "paused"]);

interface GateRow { subscription_status: string | null; role: string }

/**
 * Read both subscription_status and role in a single query. Returns nulls when
 * the columns don't exist (e.g. pre-migration dev environments) — callers
 * treat that as "no gate" via the stripe-not-configured short-circuit.
 */
export async function getSubscriptionStatus(userId: string): Promise<GateRow> {
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT subscription_status, role FROM users WHERE id = ${userId} LIMIT 1
    `) as GateRow[];
    return rows[0] ?? { subscription_status: null, role: "user" };
  } catch {
    return { subscription_status: null, role: "user" };
  }
}

/**
 * Is this user an EDITOR / VIEWER of any project whose OWNER has an active
 * subscription? Teams (migration 0009): invited members don't pay — they ride
 * on the inviter's plan. So if the user is a non-owner member somewhere and
 * the inviter is in good standing, let them in.
 */
async function isMemberOfSubscribedProject(userId: string): Promise<boolean> {
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT 1
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        JOIN users    u ON u.id = p.user_id
       WHERE pm.user_id = ${userId}
         AND pm.role IN ('editor','viewer')
         AND u.subscription_status = ANY(${["trialing", "active", "past_due", "paused"]}::text[])
       LIMIT 1
    `) as Array<{ "?column?": number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Dashboard subscription gate. If Stripe is configured and the user doesn't
 * have an active subscription, redirect to /upgrade?required=1 — the
 * card-collection step that completes the trial signup.
 *
 * Bypasses:
 *   - Stripe SDK not configured (dev / beta deploys without keys) → no gate
 *   - User is an admin → no gate
 *   - User is an editor/viewer on an actively-subscribed project (teams) → no gate
 *   - `?upgraded=1` is in the URL → no gate (absorbs the small Stripe-webhook
 *     race after Checkout completion — Stripe redirects with this flag, so the
 *     user lands on /dashboard before the webhook has stamped subscription_status)
 */
export async function requireActiveSubscription(
  userId: string,
  opts?: { allowUpgradedHint?: boolean },
): Promise<void> {
  if (!stripe) return;
  if (opts?.allowUpgradedHint) return;
  const { subscription_status, role } = await getSubscriptionStatus(userId);
  if (role === "admin") return;
  if (subscription_status && ACTIVE_STATUSES.has(subscription_status)) return;
  if (await isMemberOfSubscribedProject(userId)) return;
  redirect("/upgrade?required=1");
}
