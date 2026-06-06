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

/** Full billing picture for a user — drives the Plan card on /account and the
 *  "Manage subscription" entry in the profile menu. Combines the user's own
 *  Stripe state with the list of projects they ride on as editor/viewer when
 *  the project owner has an active subscription. */
export interface RidingMembership {
  project_id: string;
  project_name: string;
  role: "editor" | "viewer";
  owner_name: string | null;
  owner_email: string;
  owner_plan: string;
}

export interface BillingContext {
  /** True when this user has their own active Stripe subscription. */
  hasOwnActiveSub: boolean;
  /** Projects where they're editor/viewer AND the owner has an active sub. */
  memberships: RidingMembership[];
  /** Convenience: true when the user has NO own sub but is a rider on
   *  someone else's plan. Drives the "rider mode" UI everywhere. */
  isRiderOnly: boolean;
}

export async function getBillingContext(userId: string): Promise<BillingContext> {
  const sql = requireSql();
  let hasOwnActiveSub = false;
  let memberships: RidingMembership[] = [];
  try {
    const selfRows = (await sql`
      SELECT subscription_status FROM users WHERE id = ${userId} LIMIT 1
    `) as Array<{ subscription_status: string | null }>;
    const status = selfRows[0]?.subscription_status ?? null;
    hasOwnActiveSub = !!status && ACTIVE_STATUSES.has(status);

    const rows = (await sql`
      SELECT p.id AS project_id, p.name AS project_name, pm.role,
             u.name AS owner_name, u.email AS owner_email, u.plan AS owner_plan
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        JOIN users    u ON u.id = p.user_id
       WHERE pm.user_id = ${userId}
         AND pm.role IN ('editor','viewer')
         AND u.subscription_status = ANY(${["trialing", "active", "past_due", "paused"]}::text[])
       ORDER BY pm.created_at ASC
    `) as Array<{
      project_id: string; project_name: string; role: "editor" | "viewer";
      owner_name: string | null; owner_email: string; owner_plan: string;
    }>;
    memberships = rows;
  } catch {
    /* swallow — caller treats empty context as "self with no extras" */
  }
  return {
    hasOwnActiveSub,
    memberships,
    isRiderOnly: !hasOwnActiveSub && memberships.length > 0,
  };
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

/**
 * API-route variant of `requireActiveSubscription`. Same gating rules — admin
 * bypass, member-of-subscribed-project bypass, Stripe-not-configured bypass —
 * but returns a `Response` (402 Payment Required) instead of redirecting.
 *
 * Used on mutating API routes (POST /api/projects, /enrich, /refresh, etc.)
 * to close the gap where a scripted caller could burn ScraperAPI / OpenRouter
 * budget without ever loading a gated dashboard page.
 *
 * Pattern:
 *
 *     const guard = await ensureActiveSubscriptionApi(user.id);
 *     if (guard) return guard;
 *
 * Returns `null` when the user is allowed through (so the route continues
 * normally).
 */
export async function ensureActiveSubscriptionApi(userId: string): Promise<Response | null> {
  if (!stripe) return null;
  const { subscription_status, role } = await getSubscriptionStatus(userId);
  if (role === "admin") return null;
  if (subscription_status && ACTIVE_STATUSES.has(subscription_status)) return null;
  if (await isMemberOfSubscribedProject(userId)) return null;
  return new Response(
    JSON.stringify({
      error: "Subscription required",
      detail: "Your plan isn't active. Open /upgrade to start or restart a plan.",
    }),
    { status: 402, headers: { "content-type": "application/json" } },
  );
}
