import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getSubscriptionStatus } from "@/lib/billing-gate";
import { Icon } from "@/components/icons/Icon";
import UpgradePicker from "@/components/upgrade/UpgradePicker";
import "../landing.css";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your plan — Issuefy" };

type SearchParams = Promise<{ required?: string; canceled?: string }>;

/**
 * Plan picker. Two modes:
 *   - "required" → reached because the user has no active subscription. Shown
 *     after onboarding, after a canceled Checkout, or whenever the dashboard
 *     gate kicks in. Stronger copy, no escape hatch.
 *   - "default"  → reached from /account ("Change plan"). Has a back-to-account
 *     link for users browsing their options.
 */
export default async function UpgradePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateUser();
  const sp = await searchParams;
  const { subscription_status } = await getSubscriptionStatus(user.id);
  const hasActive = subscription_status === "trialing" || subscription_status === "active" || subscription_status === "past_due" || subscription_status === "paused";
  const required = sp.required === "1" || !hasActive;
  const canceled = sp.canceled === "1";

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.08 }}>
            {required ? "Start your subscription." : "Choose your plan."}
          </h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}>
            {required
              ? "Pick a plan to unlock your dashboard. Starter is free for 14 days — no charge until day 15. Card required, cancel anytime."
              : "Starter includes a 14-day free trial — no charge until day 15. Growth and Agency start today. Card required, cancel anytime."}
          </p>
          {canceled && (
            <p className="modal-hint" style={{ marginTop: 10, color: "var(--ink-2)" }}>
              No charge was made — pick a plan whenever you&apos;re ready.
            </p>
          )}
        </div>
        {!required && (
          <Link href="/account" className="btn btn-ghost">
            <Icon name="ArrowLeft01Icon" size={15} stroke={1.8} /> Back to account
          </Link>
        )}
      </header>
      <UpgradePicker currentPlan={user.plan} />
    </div>
  );
}
