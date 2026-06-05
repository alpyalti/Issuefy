"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

type Plan = "starter" | "growth" | "agency";
type Billing = "monthly" | "annual";

interface Tier {
  id: Plan;
  name: string;
  desc: string;
  monthly: number;
  annual: number;
  annualTotal: number;
  bullets: string[];
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "starter", name: "Starter", desc: "One company, one market.",
    monthly: 29, annual: 24, annualTotal: 288,
    bullets: ["1 project", "3 competitors", "15 keywords", "300 sources / month", "100 AI signals / month"],
  },
  {
    id: "growth", name: "Growth", desc: "Multiple markets or a small team.",
    monthly: 79, annual: 65, annualTotal: 780,
    bullets: ["3 projects", "5 competitors / project", "20 keywords / project", "1,500 sources / month", "500 AI signals / month", "Source filters"],
    featured: true,
  },
  {
    id: "agency", name: "Agency", desc: "Several clients or brands.",
    monthly: 199, annual: 165, annualTotal: 1980,
    bullets: ["10 projects", "5 competitors / project", "20 keywords / project", "6,000 sources / month", "2,000 AI signals / month", "Priority processing"],
  },
];

export default function UpgradePicker({ currentPlan }: { currentPlan: string }) {
  const [billing, setBilling] = useState<Billing>("annual");
  const [busy, setBusy] = useState<Plan | null>(null);

  async function pick(plan: Plan) {
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });
      if (res.status === 501) { alert("Billing isn't configured yet."); return; }
      if (res.status === 429) { alert("Slow down — wait a moment."); return; }
      if (!res.ok) { alert("Couldn't start checkout. Try again."); return; }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
        <div className="bill-toggle">
          <button
            type="button"
            className={billing === "monthly" ? "on" : ""}
            onClick={() => setBilling("monthly")}
          >Monthly</button>
          <button
            type="button"
            className={billing === "annual" ? "on" : ""}
            onClick={() => setBilling("annual")}
          >Annual <span className="bill-save">Save ~2 months</span></button>
        </div>
      </div>

      <div className="tiers" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        {TIERS.map((t) => {
          const monthly = billing === "annual" ? t.annual : t.monthly;
          const isCurrent = currentPlan === t.id;
          return (
            <div key={t.id} className={"tier " + (t.featured ? "featured" : "")}>
              {t.featured && <span className="tier-badge">Most popular</span>}
              <div className="tier-name">{t.name}</div>
              <div className="tier-desc">{t.desc}</div>
              <div className="tier-price" style={{ marginTop: 12 }}>
                <span className="cur">$</span>
                <span className="amt">{monthly}</span>
                <span className="per">/mo</span>
              </div>
              <div className="tier-bill">
                {billing === "annual" ? `billed annually · $${t.annualTotal}/yr` : "billed monthly"}
              </div>
              <div className="tier-cta">
                <button
                  className={"btn " + (t.featured ? "btn-accent" : "btn-ghost")}
                  onClick={() => pick(t.id)}
                  disabled={busy === t.id || isCurrent}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {busy === t.id ? <><Icon name="Loading03Icon" size={15} stroke={2} className="spin" />Opening…</>
                    : isCurrent ? "Current plan"
                    : <>Start 14-day trial<Icon name="ArrowRight01Icon" size={15} stroke={2} /></>}
                </button>
              </div>
              <div className="tier-trial">No charge until day 15</div>
              <ul className="tier-feats" style={{ marginTop: 18 }}>
                {t.bullets.map((b) => (
                  <li key={b}><span className="fi"><Icon name="Tick02Icon" size={14} stroke={2} /></span>{b}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: "center", marginTop: 26, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-3)", letterSpacing: ".04em" }}>
        Need more? <a href="mailto:hello@issuefy.app" style={{ color: "var(--accent-ink)" }}>Talk to us for Enterprise pricing →</a>
      </p>
    </>
  );
}
