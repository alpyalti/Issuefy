import Link from "next/link";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getSubscriptionStatus } from "@/lib/billing-gate";
import { getLimits } from "@/lib/usage";
import { Icon } from "@/components/icons/Icon";
import UpgradePicker from "@/components/upgrade/UpgradePicker";
import "../landing.css";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your plan — Issuefy" };

type SearchParams = Promise<{ required?: string; canceled?: string; reason?: string }>;

/**
 * Plan picker. Three modes:
 *   - "required" → reached because the user has no active subscription. Shown
 *     after onboarding, after a canceled Checkout, or whenever the dashboard
 *     gate kicks in. Stronger copy, no escape hatch.
 *   - "reason=project_cap" / "reason=seat_cap" → user is subscribed but has
 *     hit a plan-cap. Header tells them why they're here.
 *   - "default" → reached from /account ("Change plan"). Has a back-to-account
 *     link for users browsing their options.
 */
export default async function UpgradePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateUser();
  const sp = await searchParams;
  const { subscription_status } = await getSubscriptionStatus(user.id);
  const hasActive = subscription_status === "trialing" || subscription_status === "active" || subscription_status === "past_due" || subscription_status === "paused";
  const required = sp.required === "1" || !hasActive;
  const canceled = sp.canceled === "1";
  const reason = sp.reason; // "project_cap" | "seat_cap" | "lapse" | undefined
  const limits = getLimits(user.plan);

  // The page header copy. When the user is subscribed but at a plan cap,
  // show a focused "upgrade for more X" message instead of the generic
  // "start your subscription" copy. The "lapse" path is reached from the
  // subscription-ended email after the cleanup cron downgraded the account
  // to Starter and auto-paused extra projects.
  let title = "Choose your plan.";
  let body = "Starter includes a 14-day free trial — no charge until day 15. Growth and Agency start today. Card required, cancel anytime.";
  if (reason === "project_cap") {
    title = `You're at your project limit.`;
    body = `Your current plan allows ${limits.projects} project${limits.projects === 1 ? "" : "s"}. Upgrade for more — and to invite teammates.`;
  } else if (reason === "seat_cap") {
    title = `You're at your team-seat limit.`;
    body = `Your current plan allows ${limits.seats} seat${limits.seats === 1 ? "" : "s"} (you plus invitees). Upgrade for more.`;
  } else if (reason === "lapse") {
    title = "Resume where you left off.";
    body = "Your subscription ended and your account is back on Starter. Pick a plan to reactivate your paused projects — your data and signals are all preserved.";
  } else if (required) {
    title = "Start your subscription.";
    body = "Pick a plan to unlock your dashboard. Starter is free for 14 days — no charge until day 15. Card required, cancel anytime.";
  }

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.08 }}>
            {title}
          </h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}>{body}</p>
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
