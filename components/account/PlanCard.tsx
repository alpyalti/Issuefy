"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  agency: "Agency",
  enterprise: "Enterprise",
};

function daysLeft(end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

interface RidingMembership {
  project_name: string;
  role: "editor" | "viewer";
  owner_name: string | null;
  owner_email: string;
  owner_plan: string;
}

export default function PlanCard({
  plan, trialEndsAt, subscriptionStatus, currentPeriodEnd, cancelAtPeriodEnd,
  hasOwnActiveSub = true, memberships = [],
}: {
  plan: string;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** From getBillingContext(). Drives "rider mode" when the user has no
   *  own subscription but is a member of someone else's actively-subscribed
   *  project (Teams). Defaults preserve the original "self-billed" behaviour
   *  for the page wrapper that hasn't been updated yet. */
  hasOwnActiveSub?: boolean;
  memberships?: RidingMembership[];
}) {
  const [opening, setOpening] = useState(false);
  const isRider = !hasOwnActiveSub && memberships.length > 0;

  async function openPortal() {
    setOpening(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      } else if (res.status === 501) {
        alert("Billing isn't configured yet. Reach out to support if you need a plan change.");
      } else {
        alert("Couldn't open the billing portal. Try again in a moment.");
      }
    } finally {
      setOpening(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     Rider mode: this user has no own Stripe subscription but is on at
     least one project where the owner does. Show the inviter's plan as
     the effective one, hide billing actions, and tell them who to
     contact for changes. We don't redirect to the Stripe portal — there
     is no customer to manage on this user's behalf.
     ───────────────────────────────────────────────────────────────────── */
  if (isRider) {
    // Pick the "primary" plan to display — the highest tier among inviters
    // (so an editor on both Starter and Agency sees Agency). Ranked simply.
    const TIER_RANK: Record<string, number> = { starter: 1, growth: 2, agency: 3, enterprise: 4 };
    const primary = [...memberships].sort(
      (a, b) => (TIER_RANK[b.owner_plan] ?? 0) - (TIER_RANK[a.owner_plan] ?? 0),
    )[0];
    const inviterLabel = primary.owner_name?.trim() || primary.owner_email;
    return (
      <section className="card" style={{ padding: 22 }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Plan</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="pill pill-info" style={{ fontSize: 12 }}>
                <span className="dot" />{PLAN_LABEL[primary.owner_plan] || "Starter"}
              </span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                Member of {inviterLabel}&apos;s plan
              </span>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 540, lineHeight: 1.55 }}>
              You&apos;re using Issuefy through {inviterLabel}&apos;s subscription. They handle billing —
              {memberships.length === 1
                ? " contact them to change the plan, update the card, or cancel."
                : ` contact the project owner${memberships.length > 1 ? "(s)" : ""} to change the plan, update the card, or cancel.`}
            </p>
            {memberships.length > 1 && (
              <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {memberships.map((m) => (
                  <li key={m.project_name + m.owner_email} style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-2)" }}>
                    · {m.project_name} — {m.owner_name?.trim() || m.owner_email} ({PLAN_LABEL[m.owner_plan] || m.owner_plan})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <a href={`mailto:${primary.owner_email}?subject=${encodeURIComponent("Issuefy billing question")}`} className="btn btn-ghost">
              <Icon name="Mail01Icon" size={15} stroke={1.7} /> Contact {inviterLabel.split(/\s/)[0] || "owner"}
            </a>
            <a href="/upgrade" className="auth-link" style={{ fontSize: 12.5 }}>
              Start your own subscription →
            </a>
          </div>
        </header>
      </section>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────
     Self-billed: the normal owner path. Show the user's own Stripe state
     + Change plan / Manage billing actions. If they're ALSO riding on
     someone else's plan (rare — they own a sub and were also invited),
     surface that as a small supplemental note.
     ───────────────────────────────────────────────────────────────────── */
  const isTrialing = subscriptionStatus === "trialing" || (!subscriptionStatus && trialEndsAt);
  const trialDays = isTrialing ? daysLeft(trialEndsAt) : null;
  const renewLabel = currentPeriodEnd
    ? `Renews ${new Date(currentPeriodEnd).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
    : null;

  return (
    <section className="card" style={{ padding: 22 }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Plan</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="pill pill-info" style={{ fontSize: 12 }}>
              <span className="dot" />{PLAN_LABEL[plan] || "Starter"}
            </span>
            {isTrialing && trialDays !== null && (
              <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                Trial · {trialDays} day{trialDays === 1 ? "" : "s"} left
              </span>
            )}
            {subscriptionStatus === "past_due" && (
              <span className="mono" style={{ fontSize: 11.5, color: "var(--neg)" }}>Payment failed — please update card</span>
            )}
            {cancelAtPeriodEnd && (
              <span className="mono" style={{ fontSize: 11.5, color: "var(--warn)" }}>Canceling at period end</span>
            )}
          </div>
          {renewLabel && <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{renewLabel}</p>}
          {memberships.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              You&apos;re also a {memberships[0].role} on {memberships.length === 1 ? "1 other project" : `${memberships.length} other projects`} (owner pays).
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/upgrade" className="btn btn-ghost">
            <Icon name="ChartIncreaseIcon" size={15} stroke={1.7} /> Change plan
          </a>
          <button className="btn btn-accent" onClick={openPortal} disabled={opening}>
            {opening ? "Opening…" : "Manage billing"}
            {!opening && <Icon name="ArrowUpRight01Icon" size={14} stroke={2} />}
          </button>
        </div>
      </header>
    </section>
  );
}
