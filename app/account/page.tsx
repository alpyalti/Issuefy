import Link from "next/link";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { Icon } from "@/components/icons/Icon";
import IdentityCard from "@/components/account/IdentityCard";
import PlanCard from "@/components/account/PlanCard";
import SecurityCard from "@/components/account/SecurityCard";
import DangerZone from "@/components/account/DangerZone";
import EmailPreferences from "@/components/settings/EmailPreferences";
import SignOutButton from "@/components/auth/SignOutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account — Issuefy" };

interface AccountUserRow {
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export default async function AccountPage() {
  const user = await getOrCreateUser();
  const sql = requireSql();

  // Pull subscription columns separately — they're added by 0005_stripe.sql
  // and aren't in the base UserRow type. Coalesce defaults if columns missing
  // (Sprint B can land before Sprint C without crashing).
  let extra: AccountUserRow = { subscription_status: null, current_period_end: null, cancel_at_period_end: false };
  try {
    const rows = (await sql`
      SELECT subscription_status, current_period_end, cancel_at_period_end
      FROM users WHERE id = ${user.id} LIMIT 1
    `) as AccountUserRow[];
    if (rows[0]) extra = rows[0];
  } catch {
    // Columns may not exist yet (pre-Sprint C). Safe fallback.
  }

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 30 }}>Account</h1>
          <p className="muted" style={{ marginTop: 4 }}>Your identity, plan, and security.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn btn-ghost">
            <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Back to dashboard
          </Link>
          <SignOutButton variant="ghost" />
        </div>
      </header>

      <IdentityCard email={user.email} initialName={user.name} initialCompany={user.company_name} />

      <PlanCard
        plan={user.plan}
        trialEndsAt={user.trial_ends_at}
        subscriptionStatus={extra.subscription_status}
        currentPeriodEnd={extra.current_period_end}
        cancelAtPeriodEnd={!!extra.cancel_at_period_end}
      />

      <EmailPreferences initialEnabled={user.email_brief_enabled} />

      <SecurityCard />

      <DangerZone email={user.email} />
    </div>
  );
}
