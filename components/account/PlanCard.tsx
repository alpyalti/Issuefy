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

export default function PlanCard({
  plan, trialEndsAt, subscriptionStatus, currentPeriodEnd, cancelAtPeriodEnd,
}: {
  plan: string;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const [opening, setOpening] = useState(false);

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
