/**
 * AI signal extraction (PRD §13.5 / §16.1).
 *
 * Claims a fair batch of immutable source versions for a project, builds the prompt with the
 * full project context (including the company profile when present, §16.1),
 * calls OpenRouter for strict JSON, validates with Zod, REJECTS any returned
 * signal whose `source_id` doesn't resolve to a source row we sent (i.e. AI
 * hallucinations — PRD §13.4 acceptance: every signal must have ≥1 source),
 * then writes signals + signal_sources inside one transaction so we never
 * land orphan rows.
 *
 * Per-project/day safety rail: at most `maxSignalsPerProjectPerDay` signals
 * are written; remaining candidates are cached for a later day (PRD §21.3).
 */
import { claimAnalysis, finishAnalysis, releaseAnalysis } from "./source-analysis";
import { requireSql } from "./db";
import { chatJson } from "./openrouter";
import { getLimits } from "./usage";
import { captureError } from "./sentry";
import { resolveMarket } from "./markets";
import { companyPromptBlock } from "./company-block";
import {
  signalExtractionResponseSchema,
  SIGNAL_CATEGORIES,
  IMPORTANCE,
} from "./schemas/ai";

interface ProjectContext {
  id: string;
  user_id: string;
  name: string;
  company_name: string | null;
  company_website: string | null;
  company_description: string | null;
  company_socials: Record<string, string> | null;
  track_company: boolean;
  industry: string;
  business_type: string;
  target_market: string;
}

interface CompetitorContext {
  name: string;
  website_url: string;
  socials: Record<string, string> | null;
}

interface KeywordContext {
  keyword: string;
}

export interface GenerateSignalsResult {
  inserted: number;
  rejected: number;
  modelUsed: string | null;
  errors: string[];
}

const MAX_SOURCES_PER_BATCH = 8; // keep prompt under ~50k chars at ~6k/source
const MAX_CHARS_PER_SOURCE = 6_000; // PRD §10.8

// JSON Schema mirroring lib/schemas/ai.ts — sent to OpenRouter for strict output.
const SIGNAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["signals"],
  properties: {
    signals: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_id", "title", "category", "description", "importance", "confidence_score", "suggested_action"],
        properties: {
          source_id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 3, maxLength: 200 },
          category: { type: "string", enum: SIGNAL_CATEGORIES as unknown as string[] },
          description: { type: "string", minLength: 1, maxLength: 1_000 },
          importance: { type: "string", enum: IMPORTANCE as unknown as string[] },
          confidence_score: { type: "integer", minimum: 0, maximum: 100 },
          suggested_action: { type: "string", maxLength: 400 },
        },
      },
    },
  },
} as const;

/**
 * Generate signals for a single project from the most recent unprocessed
 * source versions. Empty successful analyses complete their version; failed
 * attempts retry. Exact normalized duplicate signals are never republished.
 */
export async function generateSignalsForProject(projectId: string): Promise<GenerateSignalsResult> {
  const sql = requireSql();
  const errors: string[] = [];

  const projRows = (await sql`
    SELECT id, user_id, name, company_name, company_website, company_description,
           company_socials, track_company, industry, business_type, target_market
    FROM projects WHERE id = ${projectId} LIMIT 1
  `) as ProjectContext[];
  const project = projRows[0];
  if (!project) throw new Error(`generateSignals: project ${projectId} not found`);

  const userRows = (await sql`SELECT plan FROM users WHERE id = ${project.user_id} LIMIT 1`) as { plan: string }[];
  const limits = getLimits(userRows[0]?.plan);

  const competitors = (await sql`
    SELECT name, website_url, socials FROM competitors
    WHERE project_id = ${projectId} AND is_active = true
  `) as CompetitorContext[];

  const keywords = (await sql`
    SELECT keyword FROM keywords WHERE project_id = ${projectId} AND is_active = true
  `) as KeywordContext[];

  // Avoid paid analysis when today's publication budget is already exhausted.
  // finishAnalysis repeats the cap check under a project lock before writing.
  const counts = (await sql`SELECT COUNT(*)::int AS n FROM signals
    WHERE project_id=${projectId} AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`) as { n: number }[];
  if ((counts[0]?.n ?? 0) >= limits.maxSignalsPerProjectPerDay) {
    return { inserted: 0, rejected: 0, modelUsed: null, errors: [] };
  }
  const claim = await claimAnalysis(projectId, MAX_SOURCES_PER_BATCH);
  const sources = claim.versions;
  const unprocessed = sources.filter((s) => s.result_signals === null);

  if (sources.length === 0) {
    return { inserted: 0, rejected: 0, modelUsed: null, errors: [] };
  }

  // A queued revision may wait behind older work. Preserve its before/after
  // evidence regardless of today's scrape clock; observation time is explicit.
  const hasPriorChange = (s: { prior_cleaned_text: string | null; cleaned_text: string }) =>
    !!s.prior_cleaned_text && s.prior_cleaned_text !== s.cleaned_text;

  // Build the prompt. The model receives source_id explicitly so it can
  // attribute each signal back to a specific row — we use this to drop
  // hallucinated/orphan signals on the way in. Sources whose content changed
  // since the last scrape also carry a before/after diff: text_before is the
  // previous cleaned_text, text is the new one. The model is told (system
  // rule 9) to compare them and emit a signal only when the change is
  // materially business-relevant.
  const sourcesJson = unprocessed.map((s) => {
    const text = (s.cleaned_text || "").slice(0, MAX_CHARS_PER_SOURCE);
    const fresh = hasPriorChange(s);
    return fresh
      ? {
          source_id: s.id,
          title: s.title,
          url: s.url,
          text,
          changed_since_last_scrape: true,
          observed_change_at: s.last_changed_at,
          text_before: (s.prior_cleaned_text ?? "").slice(0, MAX_CHARS_PER_SOURCE),
        }
      : { source_id: s.id, title: s.title, url: s.url, text };
  });

  const companyBlock = companyPromptBlock(project, "(No company profile — run on competitors and keywords only.)");

  // Resolve once so the prompt sees the canonical label ("Turkey", "Global",
  // "Latin America") rather than the dropdown code ("TR", "REGION_LATAM").
  const market = resolveMarket(project.target_market);

  const systemPrompt = [
    "You are Issuefy, a market-intelligence analyst that extracts actionable business signals from public web sources.",
    "Output strict JSON only — no prose, no markdown.",
    "Rules:",
    "  VERSION CONTEXT: inputs are queued immutable source revisions, possibly older than today. changed_since_last_scrape compares the stored previous revision; observed_change_at is an observation timestamp, NOT an event date or proof that an event happened today.",
    "  1. Use ONLY information present in the provided source texts. Never invent facts.",
    "  2. Each signal must cite ONE specific source_id from the input set.",
    "  3. If no useful business signal exists, return an empty signals array.",
    "  4. Categories MUST be one of: Competitor Move, Customer Pain Point, Market Opportunity, Threat / Risk, Trend Signal, Regulation / Policy, Pricing / Offer Change, Service Demand Signal, Industry Event.",
    "     - 'Industry Event' covers relevant conferences, summits, trade shows, webinars, and networking events mentioned in the source — the kind a user would want to attend, sponsor, or watch. Include the event date and location in the description if the source provides them. Skip routine vendor product webinars unless they're publicly notable.",
    "  5. Importance is Low, Medium, or High. confidence_score is a 0-100 integer reflecting how clearly the source supports the claim.",
    "  6. Keep titles short (<= 120 chars). Keep descriptions short and business-focused.",
    "  7. Prefer signals that change a decision: pricing moves, demand shifts, recurring complaints, new entrants, regulation, must-attend events.",
    "  8. Assess opportunities and risks RELATIVE TO the user's own company when the company profile is provided.",
    "  9. CHANGE DETECTION: when a source has changed_since_last_scrape=true, it carries text_before (the page's previous content) and text (its current content). Compare them and emit a signal ONLY when the change is materially business-relevant — e.g. new pricing, repositioning, new product/feature launch, dropped product, leadership change, layoff announcement, policy update, new geographic market, new partnership. SKIP micro-edits and noise: copy tweaks, rotating testimonials, blog post listings rotating, footer dates, image swaps, A/B test variants, cookie banners. Be conservative. When you do emit, write the title and description around what specifically changed (e.g. 'Acme raised pricing $29 → $39' or 'Acme rewrote homepage to target enterprise IT'), pick the most accurate category (usually Competitor Move or Pricing / Offer Change), and cite the source.",
    "  10. TARGET MARKET PRIORITY: signals about events, regulations, competitors, customers, or news in the user's target market outrank generic global signals. When ranking importance, treat local-market relevance as a bump (e.g. a regulatory change in the target country → at least Medium importance; a generic global trend with no local angle → Low unless it directly threatens the user's company).",
    "  11. SOURCE QUALITY: prioritize FRESH, DATED developments — competitor social-media posts, news, announcements, launches, pricing/offer changes, partnerships. Do NOT emit a signal that merely restates static or encyclopedic background (company history, generic 'what we do' descriptions, mission statements, Wikipedia-style facts). An encyclopedic or reference source should yield a signal ONLY when it reports a genuinely new, dated event. A competitor's social post announcing something real outranks a static corporate or reference page covering the same topic — prefer and cite the social/news source.",
  ].join("\n");

  const userPrompt = [
    `Project: ${project.name}`,
    `Industry: ${project.industry}`,
    `Business type: ${project.business_type}`,
    `Target market: ${market.canonicalName}`,
    `Prioritize signals relevant to "${market.canonicalName}". Local regulations, competitors, customers, and news in that region outrank generic global signals.`,
    companyBlock,
    `Competitors: ${competitors.map((c) => `${c.name} (${c.website_url})`).join("; ") || "(none yet)"}`,
    `Keywords: ${keywords.map((k) => k.keyword).join(", ") || "(none yet)"}`,
    "",
    "Sources:",
    JSON.stringify(sourcesJson, null, 2),
    "",
    "Return strict JSON: { \"signals\": [ { source_id, title, category, description, importance, confidence_score, suggested_action } ] }",
  ].join("\n");

  let ai;
  try {
    ai = unprocessed.length ? await chatJson({
      schemaName: "issuefy_signals",
      jsonSchema: SIGNAL_JSON_SCHEMA,
      zodSchema: signalExtractionResponseSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2_500,
    }) : { data: { signals: [] }, modelUsed: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureError(e, { stage: "openrouter:signals", projectId });
    await releaseAnalysis(claim.token).catch((releaseError) => captureError(releaseError, { stage: "analysis:release", projectId }));
    return { inserted: 0, rejected: 0, modelUsed: null, errors: [msg] };
  }

  // Prompt IDs identify immutable version snapshots; publication links them to
  // their original source rows. Multiple queued revisions never share prompt IDs.
  const validSourceIds = new Set(unprocessed.map((s) => s.id));
  const accepted = ai.data.signals.filter((s) => validSourceIds.has(s.source_id));
  let rejected = ai.data.signals.length - accepted.length;
  if (rejected > 0) {
    // Unknown attribution is a malformed batch, not a successful empty result.
    await releaseAnalysis(claim.token).catch((e) => captureError(e, { stage: "analysis:release", projectId }));
    return { inserted: 0, rejected, modelUsed: ai.modelUsed, errors: ["Invalid source attribution; analysis batch remains retryable."] };
  }
  const results = new Map(unprocessed.map((s) => [s.id, accepted.filter((sig) => sig.source_id === s.id).map((sig) => ({ ...sig, suggested_action: sig.suggested_action ?? "" }))]));
  let inserted = 0;
  try {
    const committed = await finishAnalysis(projectId, claim.token, results, limits.maxSignalsPerProjectPerDay);
    inserted = committed.inserted;
    rejected += committed.duplicates;
    if (committed.finalized !== sources.length) errors.push("Source analysis claim expired; uncommitted versions remain retryable.");
  } catch (e) {
    captureError(e, { stage: "insert:signals", projectId });
    await releaseAnalysis(claim.token).catch((releaseError) => captureError(releaseError, { stage: "analysis:release", projectId }));
    return { inserted: 0, rejected, modelUsed: ai.modelUsed, errors: [e instanceof Error ? e.message : "insert failed"] };
  }

  return { inserted: inserted, rejected, modelUsed: ai.modelUsed, errors };
}
