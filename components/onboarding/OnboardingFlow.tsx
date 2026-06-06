"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { CompanyCard } from "./CompanyCard";
import { ChipInput } from "./ChipInput";
import { domainFrom, type CompanyData, type Social } from "./enrich";
import type { IconName } from "@/components/icons/registry";

/**
 * Full 6-step onboarding flow (PRD §17.2). Replaces the prototype's localStorage
 * modal: hits the real /api/enrich → /api/projects → /api/projects/:id/competitors
 * → /api/projects/:id/keywords endpoints, then redirects to the new project's
 * dashboard.
 *
 * Required business-details fields (PRD §12.2): project name, industry,
 * business type, target market — collected on step 3 alongside the enriched
 * company profile, so we honor the "at least 1 competitor OR ≥3 keywords"
 * monitoring-start rule (§13.1) before kicking the user into the dashboard.
 */

const BUSINESS_TYPES = [
  "Logistics / Transportation",
  "B2B Services",
  "Agency",
  "SaaS",
  "Consumer Brand",
  "E-commerce",
  "Other",
] as const;

const STEPS = ["Welcome", "Your company", "Confirm company", "Competitors", "Keywords", "Finish"] as const;
const KEYWORD_SUGGESTIONS = ["pricing", "onboarding", "funding rounds", "regulation", "supply chain"];

const SOCIAL_ICON: Record<string, IconName> = {
  website: "Globe02Icon",
  instagram: "InstagramIcon",
  facebook: "Facebook01Icon",
  linkedin: "Linkedin01Icon",
  x: "NewTwitterIcon",
  twitter: "NewTwitterIcon",
  youtube: "YoutubeIcon",
  tiktok: "TiktokIcon",
};

interface ServerProfile {
  name: string;
  description: string;
  logo_url: string | null;
  socials: Record<string, string>;
  source_url: string;
  status: "enriched" | "failed" | "manual";
}

interface Suggestion { name: string; website: string; reason: string; }

function profileToCardData(profile: ServerProfile, fallbackUrl: string): CompanyData {
  const domain = domainFrom(profile.source_url || fallbackUrl);
  const initials = profile.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || domain.slice(0, 2).toUpperCase();
  const socials: Social[] = Object.entries(profile.socials || {}).map(([kind, value]) => ({
    kind: kind === "x" ? "X" : kind.charAt(0).toUpperCase() + kind.slice(1),
    icon: SOCIAL_ICON[kind] || "Globe02Icon",
    value,
    on: true,
  }));
  return {
    name: profile.name,
    domain,
    tagline: profile.description.slice(0, 100),
    color: "#15171A",
    initials,
    socials,
  };
}

function cardToSocialsPayload(card: CompanyData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of card.socials) {
    if (!s.on || !s.value) continue;
    const k = s.kind.toLowerCase();
    out[k === "twitter" ? "x" : k] = s.value;
  }
  return out;
}

export default function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  // Step 2 / 3 — your company
  const [skipCompany, setSkipCompany] = useState(false);
  const [companyUrl, setCompanyUrl] = useState("");
  const [companyEnriching, setCompanyEnriching] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [enrichErr, setEnrichErr] = useState<string | null>(null);
  // Business details (always required, PRD §12.2)
  const [projectName, setProjectName] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number]>("B2B Services");
  const [targetMarket, setTargetMarket] = useState("");
  // Step 4 — competitors
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorEnriching, setCompetitorEnriching] = useState(false);
  const [competitors, setCompetitors] = useState<CompanyData[]>([]);
  // Competitor suggestions (auto-fetched on the competitors step)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestTried, setSuggestTried] = useState(false);
  const [addingDomain, setAddingDomain] = useState<string | null>(null);
  // Step 5 — keywords
  const [keywords, setKeywords] = useState<string[]>([]);
  // Step 6 — submitting
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const companyInputRef = useRef<HTMLInputElement>(null);
  const competitorInputRef = useRef<HTMLInputElement>(null);

  async function enrichUrl(url: string): Promise<ServerProfile | null> {
    setEnrichErr(null);
    if (!url.trim() || !domainFrom(url).includes(".")) {
      setEnrichErr("That doesn't look like a website URL.");
      return null;
    }
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.status === 429) {
      setEnrichErr("You've reached this cycle's scrape budget. Upgrade your plan to keep monitoring.");
      return null;
    }
    if (!res.ok) {
      setEnrichErr("Couldn't read that website. You can fill the details by hand.");
      return null;
    }
    const data = (await res.json()) as { profile: ServerProfile | null };
    if (!data.profile) {
      setEnrichErr("Couldn't read that website. You can fill the details by hand.");
      return null;
    }
    return data.profile;
  }

  async function lookupCompany() {
    setCompanyEnriching(true);
    const profile = await enrichUrl(companyUrl);
    setCompanyEnriching(false);
    if (!profile) return;
    const card = profileToCardData(profile, companyUrl);
    setCompanyData(card);
    if (!projectName) setProjectName(card.name);
    setStep(2);
  }

  // Enrich a URL and add it to the competitor list (deduped). Shared by the
  // manual "Find" button and the one-click suggestion cards.
  async function addCompetitorByUrl(url: string): Promise<boolean> {
    const profile = await enrichUrl(url);
    if (!profile) return false;
    const card = profileToCardData(profile, url);
    setCompetitors((prev) => (prev.some((c) => c.domain === card.domain) ? prev : [...prev, card]));
    return true;
  }

  async function lookupCompetitor() {
    setCompetitorEnriching(true);
    const ok = await addCompetitorByUrl(competitorUrl);
    setCompetitorEnriching(false);
    if (ok) { setCompetitorUrl(""); competitorInputRef.current?.focus(); }
  }

  async function addSuggestion(s: Suggestion) {
    setAddingDomain(s.website);
    await addCompetitorByUrl(s.website);
    setAddingDomain(null);
  }

  // Ask the model for 2-3 real competitors that fit the company profile.
  // Pure LLM call (no scrape budget) — degrades to nothing on error.
  async function fetchSuggestions() {
    setSuggestLoading(true);
    setSuggestTried(true);
    try {
      const res = await fetch("/api/recommend-competitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_name: companyData?.name || undefined,
          company_website: companyData?.domain || undefined,
          company_description: companyData?.tagline || undefined,
          industry: industry.trim() || undefined,
          business_type: businessType,
          target_market: targetMarket.trim() || undefined,
          exclude: competitors.map((c) => c.domain),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { competitors?: Suggestion[] };
        setSuggestions(Array.isArray(data.competitors) ? data.competitors : []);
      }
    } catch {
      /* leave suggestions empty */
    }
    setSuggestLoading(false);
  }

  // Auto-fetch suggestions the first time the user reaches the competitors step,
  // as long as we have something to base them on.
  useEffect(() => {
    if (step === 3 && !suggestTried && (companyData || industry.trim() || targetMarket.trim())) {
      fetchSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function canAdvance(): boolean {
    if (step === 0) return true;
    if (step === 1) return skipCompany || !!companyData;
    if (step === 2) return projectName.trim().length > 0 && industry.trim().length > 0 && targetMarket.trim().length > 0;
    if (step === 3) return competitors.length >= 1 || keywords.length >= 3; // PRD §13.1
    if (step === 4) return true; // keywords step always allows continue
    return true;
  }

  async function submitOnboarding() {
    setSubmitErr(null);
    setSubmitting(true);
    try {
      const companyBody = !skipCompany && companyData ? {
        company_name: companyData.name,
        company_website: companyData.domain,
        company_description: companyData.tagline,
        company_socials: cardToSocialsPayload(companyData),
        track_company: true,
      } : {};

      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          industry: industry.trim(),
          business_type: businessType,
          target_market: targetMarket.trim(),
          ...companyBody,
        }),
      });
      if (!projRes.ok) {
        const err = await projRes.json().catch(() => ({}));
        throw new Error(err.error || "Couldn't create the project");
      }
      const { project } = (await projRes.json()) as { project: { id: string } };

      // Fan out competitor + keyword creation in parallel — order doesn't matter.
      const compCalls = competitors.map((c) => fetch(`/api/projects/${project.id}/competitors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          website_url: c.domain,
          name: c.name,
          description: c.tagline,
          socials: cardToSocialsPayload(c),
        }),
      }));
      const kwCalls = keywords.map((k) => fetch(`/api/projects/${project.id}/keywords`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: k }),
      }));
      await Promise.allSettled([...compCalls, ...kwCalls]);

      // Trial gate: every new user must finish Stripe Checkout before reaching
      // the dashboard. Pricing-page params (?plan & ?billing) win; otherwise
      // we default to Starter / annual (the 14-day free trial). If Checkout
      // can't be created (Stripe not configured, e.g. dev) we fall through to
      // the dashboard so local development isn't blocked.
      const params = new URLSearchParams(window.location.search);
      const plan = params.get("plan") || "starter";
      const billing = params.get("billing") || "annual";
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan, billing }),
        });
        if (res.ok) {
          const { url } = await res.json();
          if (url) { window.location.href = url; return; }
        }
        if (res.status === 501) {
          // Stripe not configured — let the user into the app (dev/beta).
          router.push(`/dashboard/${project.id}`);
          return;
        }
        // Other failures: the gate on /dashboard will catch them and bounce
        // to /upgrade?required=1. Send them straight there to skip a hop.
        window.location.href = "/upgrade?required=1";
      } catch {
        window.location.href = "/upgrade?required=1";
      }
    } catch (e) {
      setSubmitting(false);
      setSubmitErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const canNext = canAdvance();
  // Hide suggestions the user already added.
  const addedDomains = new Set(competitors.map((c) => c.domain));
  const visibleSuggestions = suggestions.filter((s) => !addedDomains.has(s.website));

  return (
    <div className="modal-overlay onb-overlay" style={{ background: "var(--bg)" }}>
      <div className="modal onb" style={{ animation: "none" }} onClick={(e) => e.stopPropagation()}>
        <div className="onb-top">
          <div className="onb-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={"onb-dot " + (i <= step ? "on" : "")} />
            ))}
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".08em", textTransform: "uppercase" }}>
            Step {step + 1} / {STEPS.length}
          </span>
        </div>

        <div className="onb-body">
          {step === 0 && (
            <div className="onb-step">
              <div className="onb-mark"><Icon name="SparklesIcon" size={34} stroke={1.5} /></div>
              <h2>Welcome to Issuefy{userName ? `, ${userName}` : ""}.</h2>
              <p>Every morning, Issuefy reads the market for you — competitors, customer signals and risks — and hands you one short, sourced brief. Let&apos;s set up what to watch. It takes about a minute.</p>
            </div>
          )}

          {step === 1 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 1 · Your company</span>
              <h2>First, what&apos;s your company?</h2>
              <p>Issuefy assesses opportunities and risks <i>relative to you</i>. Paste your company website and we&apos;ll pull in your basic profile and social channels — or skip this and run on competitors and keywords only.</p>
              {!skipCompany && !companyData && (
                <>
                  <div className="lookup">
                    <div className="lookup-field">
                      <Icon name="Globe02Icon" size={17} stroke={1.7} />
                      <span className="lookup-proto">https://</span>
                      <input
                        ref={companyInputRef}
                        value={companyUrl}
                        onChange={(e) => setCompanyUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") lookupCompany(); }}
                        placeholder="yourcompany.com"
                        autoFocus
                        disabled={companyEnriching}
                      />
                    </div>
                    <button className="btn btn-accent lookup-btn" onClick={lookupCompany} disabled={companyEnriching || !companyUrl}>
                      {companyEnriching ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" /> Looking up…</> : "Find my company"}
                    </button>
                  </div>
                  {enrichErr && <p className="modal-hint" style={{ color: "var(--neg)", marginTop: 8 }}>{enrichErr}</p>}
                  <button className="btn btn-quiet" style={{ marginTop: 12 }} onClick={() => { setSkipCompany(true); setStep(2); }}>
                    Skip — track competitors and keywords only
                  </button>
                </>
              )}
              {companyData && (
                <CompanyCard
                  data={companyData}
                  onChange={setCompanyData}
                  onRemove={() => { setCompanyData(null); setCompanyUrl(""); }}
                />
              )}
            </div>
          )}

          {step === 2 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 2 · Project details</span>
              <h2>Tell us about this project.</h2>
              <p>These details help Issuefy tune what it surfaces for you each morning. All required.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
                <input className="modal-input" placeholder="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                <input className="modal-input" placeholder="Industry (e.g. logistics, fintech)" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                <select className="modal-input" value={businessType} onChange={(e) => setBusinessType(e.target.value as (typeof BUSINESS_TYPES)[number])} style={{ paddingRight: 18, cursor: "pointer" }}>
                  {BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}
                </select>
                <input className="modal-input" placeholder="Target market or region (e.g. EU mid-market)" value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} />
              </div>
              {!skipCompany && companyData && (
                <div style={{ marginTop: 16 }}>
                  <p className="modal-hint" style={{ marginBottom: 8 }}>Your company profile · edit if anything is off.</p>
                  <CompanyCard data={companyData} onChange={setCompanyData} compact />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 3 · Competitors</span>
              <h2>Who do you want to watch?</h2>
              <p>Paste a competitor&apos;s website — Issuefy finds their basic info and social channels for you. Add 1–5.</p>
              <div className="lookup">
                <div className="lookup-field">
                  <Icon name="Globe02Icon" size={17} stroke={1.7} />
                  <span className="lookup-proto">https://</span>
                  <input
                    ref={competitorInputRef}
                    value={competitorUrl}
                    onChange={(e) => setCompetitorUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") lookupCompetitor(); }}
                    placeholder="competitor.com"
                    disabled={competitorEnriching}
                  />
                </div>
                <button className="btn btn-accent lookup-btn" onClick={lookupCompetitor} disabled={competitorEnriching || !competitorUrl}>
                  {competitorEnriching ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" /> Finding…</> : "Find"}
                </button>
              </div>
              {enrichErr && <p className="modal-hint" style={{ color: "var(--neg)", marginTop: 8 }}>{enrichErr}</p>}

              {/* AI-suggested competitors — fits the company profile, one click to add. */}
              {(suggestLoading || visibleSuggestions.length > 0) && (
                <div className="onb-suggest">
                  <div className="onb-suggest-head">
                    <Icon name="SparklesIcon" size={14} stroke={1.7} />
                    <span>{suggestLoading ? "Finding competitors that fit…" : "Suggested for you"}</span>
                  </div>
                  {suggestLoading ? (
                    <div className="onb-suggest-loading">
                      <Icon name="Loading03Icon" size={16} stroke={2} className="spin" /> Looking at your market…
                    </div>
                  ) : (
                    visibleSuggestions.map((s) => (
                      <div className="onb-suggest-item" key={s.website}>
                        <span className="onb-suggest-meta">
                          <span className="onb-suggest-name">{s.name} <span className="onb-suggest-domain">{s.website}</span></span>
                          <span className="onb-suggest-reason">{s.reason}</span>
                        </span>
                        <button
                          className="btn btn-ghost btn-sm onb-suggest-add"
                          onClick={() => addSuggestion(s)}
                          disabled={addingDomain === s.website}
                        >
                          {addingDomain === s.website
                            ? <><Icon name="Loading03Icon" size={14} stroke={2} className="spin" /> Adding…</>
                            : <><Icon name="Add01Icon" size={14} stroke={2.2} /> Add</>}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="onb-list">
                {competitors.length === 0 && !suggestLoading && visibleSuggestions.length === 0 && (
                  <div className="onb-empty">No competitors yet — paste a website above to add one.</div>
                )}
                {competitors.map((c, i) => (
                  <CompanyCard
                    key={c.domain}
                    data={c}
                    onChange={(d) => setCompetitors((prev) => prev.map((x, j) => (j === i ? d : x)))}
                    onRemove={() => setCompetitors((prev) => prev.filter((_, j) => j !== i))}
                    compact
                  />
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onb-step">
              <span className="onb-kicker">Step 4 · Keywords</span>
              <h2>Any topics to follow?</h2>
              <p>Add themes to track across the whole market, not just one company. Three or more recommended — fewer is fine if you have at least one competitor.</p>
              <ChipInput items={keywords} setItems={setKeywords} suggestions={KEYWORD_SUGGESTIONS} placeholder="Type a keyword, press Enter" />
            </div>
          )}

          {step === 5 && (
            <div className="onb-step">
              <div className="onb-mark"><Icon name="CheckmarkBadge01Icon" size={34} stroke={1.5} /></div>
              <h2>You&apos;re all set.</h2>
              <p>
                Tracking <b>{skipCompany ? projectName : companyData?.name || projectName}</b> in {industry || "your industry"},
                with <b>{competitors.length}</b> competitor{competitors.length === 1 ? "" : "s"} and <b>{keywords.length}</b> keyword{keywords.length === 1 ? "" : "s"}.
                Your first brief will arrive tomorrow morning, or you can trigger a refresh from the dashboard at any time.
              </p>
              {submitErr && <p className="modal-hint" style={{ color: "var(--neg)" }}>{submitErr}</p>}
            </div>
          )}
        </div>

        <div className="onb-foot">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={submitting}>Back</button>
          ) : <span className="onb-spacer" />}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-accent" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue<Icon name="ArrowRight01Icon" size={16} stroke={2} />
            </button>
          ) : (
            <button className="btn btn-accent" onClick={submitOnboarding} disabled={submitting}>
              {submitting ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" /> Creating project…</> : <>Open my dashboard<Icon name="ArrowRight01Icon" size={16} stroke={2} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
