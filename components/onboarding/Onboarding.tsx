"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { WebsiteLookup } from "./WebsiteLookup";
import { CompanyCard } from "./CompanyCard";
import { ChipInput } from "./ChipInput";
import type { CompanyData } from "./enrich";

export interface OnboardingResult {
  me: CompanyData | null;
  competitors: CompanyData[];
  keywords: string[];
}

/* First-run onboarding (modals.jsx Onboarding): welcome → your company →
   competitors → keywords → done. Phase 2 promotes this to the /onboarding route
   with required business-details fields + split confirm steps. */
export function Onboarding({
  userName,
  onClose,
  onComplete,
}: {
  userName: string;
  onClose: () => void;
  onComplete: (result: OnboardingResult) => void;
}) {
  const [step, setStep] = useState(0);
  const [me, setMe] = useState<CompanyData | null>(null);
  const [competitors, setCompetitors] = useState<CompanyData[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const STEPS = ["Welcome", "Your company", "Competitors", "Keywords", "Done"];
  const N = STEPS.length;
  const first = (userName || "").split(" ")[0];

  function addCompetitor(d: CompanyData) {
    setCompetitors((prev) => (prev.some((c) => c.domain === d.domain) ? prev : [...prev, d]));
  }
  function updateCompetitor(i: number, d: CompanyData) {
    setCompetitors((prev) => prev.map((c, j) => (j === i ? d : c)));
  }
  function removeCompetitor(i: number) {
    setCompetitors((prev) => prev.filter((_, j) => j !== i));
  }
  function finish() {
    onComplete({ me, competitors, keywords });
    onClose();
  }

  const canNext = step !== 1 || !!me;

  return (
    <div className="modal-overlay onb-overlay">
      <div className="modal onb" onClick={(e) => e.stopPropagation()}>
        <div className="onb-top">
          <div className="onb-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={"onb-dot " + (i <= step ? "on" : "")} />
            ))}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Skip">Skip</button>
        </div>
        <div className="onb-body">
          {step === 0 && (
            <div className="onb-step">
              <div className="onb-mark"><Icon name="SparklesIcon" size={34} stroke={1.5} /></div>
              <h2>Welcome to Issuefy{first ? `, ${first}` : ""}.</h2>
              <p>Every morning, Issuefy reads the market for you — competitors, customer signals and risks — and hands you one short, sourced brief. Let&apos;s set up what to watch. It takes about a minute.</p>
            </div>
          )}

          {step === 1 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 1 · Your company</span>
              <h2>First, what&apos;s your company?</h2>
              <p>We track your company too — so opportunities and risks are judged against <i>you</i>, not in a vacuum. Paste your website and we&apos;ll pull in your profiles.</p>
              {me ? (
                <>
                  <CompanyCard data={me} onChange={setMe} onRemove={() => setMe(null)} />
                  <p className="onb-confirm"><Icon name="CheckmarkBadge01Icon" size={15} stroke={1.7} color="#1A8A5C" /> Looks right? Edit anything above, or continue.</p>
                </>
              ) : (
                <WebsiteLookup placeholder="yourcompany.com" cta="Find my company" busyLabel="Looking up…" onFound={setMe} />
              )}
            </div>
          )}

          {step === 2 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 2 · Competitors</span>
              <h2>Who do you want to watch?</h2>
              <p>Just paste a competitor&apos;s website — Issuefy finds their channels for you. Add as many as you like.</p>
              <WebsiteLookup placeholder="competitor.com" cta="Find" onFound={addCompetitor} />
              <div className="onb-list">
                {competitors.length === 0 && (
                  <div className="onb-empty">No competitors yet. Try <b>northwind.io</b> or <b>vega.com</b>.</div>
                )}
                {competitors.map((c, i) => (
                  <CompanyCard key={c.domain} data={c} onChange={(d) => updateCompetitor(i, d)} onRemove={() => removeCompetitor(i)} compact />
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 3 · Keywords</span>
              <h2>Any topics to follow?</h2>
              <p>Add themes to track across the whole market, not just one company. Optional — you can skip this.</p>
              <ChipInput items={keywords} setItems={setKeywords} suggestions={["usage-based pricing", "onboarding", "funding", "consolidation"]} placeholder="Type a keyword, press Enter" />
            </div>
          )}

          {step === 4 && (
            <div className="onb-step">
              <div className="onb-mark"><Icon name="CheckmarkBadge01Icon" size={34} stroke={1.5} /></div>
              <h2>You&apos;re all set.</h2>
              <p>Tracking <b>{me ? me.name : "your company"}</b>, <b>{competitors.length}</b> competitor{competitors.length === 1 ? "" : "s"} and <b>{keywords.length}</b> keyword{keywords.length === 1 ? "" : "s"}. Your first brief lands tomorrow at <b>7:00 AM</b> — and you can change or remove anything from your watchlist anytime.</p>
            </div>
          )}
        </div>
        <div className="onb-foot">
          {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button> : <span className="onb-spacer" />}
          {step < N - 1 ? (
            <button className="btn btn-accent" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 3 && keywords.length === 0 ? "Skip for now" : "Continue"}
              <Icon name="ArrowRight01Icon" size={16} stroke={2} />
            </button>
          ) : (
            <button className="btn btn-accent" onClick={finish}>Open my dashboard<Icon name="ArrowRight01Icon" size={16} stroke={2} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
