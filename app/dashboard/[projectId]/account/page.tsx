import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getBillingContext } from "@/lib/billing-gate";
import IdentityCard from "@/components/account/IdentityCard";
import PlanCard from "@/components/account/PlanCard";
import SecurityCard from "@/components/account/SecurityCard";
import DangerZone from "@/components/account/DangerZone";
import EmailPreferences from "@/components/settings/EmailPreferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account — Issuefy" };

interface AccountUserRow {
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

/**
 * Account (user-level) — rendered INSIDE the dashboard shell (sidebar + topbar)
 * so it shares the same chrome as every other page. Reached from the bottom-left
 * profile menu. The top-level /account route redirects here.
 *
 * This is strictly user-scoped (identity, plan, billing, notifications,
 * security, account deletion). Project-scoped settings live on the project
 * Settings page — the two no longer overlap (Email Preferences lives here only).
 */
export default async function AccountPage() {
  const user = await getOrCreateUser();
  const sql = requireSql();

  // Subscription columns come from 0005_stripe.sql and aren't in the base
  // UserRow type. Coalesce defaults if the columns are missing.
  let extra: AccountUserRow = { subscription_status: null, current_period_end: null, cancel_at_period_end: false };
  try {
    const rows = (await sql`
      SELECT subscription_status, current_period_end, cancel_at_period_end
      FROM users WHERE id = ${user.id} LIMIT 1
    `) as AccountUserRow[];
    if (rows[0]) extra = rows[0];
  } catch {
    /* columns may not exist yet — safe fallback */
  }

  // Teams: an invited member with no own subscription rides on the inviter's
  // plan. Show that on the Plan card and gate billing actions.
  const billing = await getBillingContext(user.id);

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <IdentityCard email={user.email} initialName={user.name} initialCompany={user.company_name} />

      <PlanCard
        plan={user.plan}
        trialEndsAt={user.trial_ends_at}
        subscriptionStatus={extra.subscription_status}
        currentPeriodEnd={extra.current_period_end}
        cancelAtPeriodEnd={!!extra.cancel_at_period_end}
        hasOwnActiveSub={billing.hasOwnActiveSub}
        memberships={billing.memberships}
      />

      <EmailPreferences initialEnabled={user.email_brief_enabled} />

      <SecurityCard />

      <DangerZone email={user.email} />
    </div>
  );
}
