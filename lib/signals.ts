/**
 * AI signal extraction (PRD §13.5 / §16.1).
 *
 * Pulls a batch of recent sources for a project, builds the prompt with the
 * full project context (including the company profile when present, §16.1),
 * calls OpenRouter for strict JSON, validates with Zod, REJECTS any returned
 * signal whose `source_id` doesn't resolve to a source row we sent (i.e. AI
 * hallucinations — PRD §13.4 acceptance: every signal must have ≥1 source),
 * then writes signals + signal_sources inside one transaction so we never
 * land orphan rows.
 *
 * Per-project/day safety rail: at most `maxSignalsPerProjectPerDay` signals
 * are written; further extracted signals are dropped (PRD §21.3).
 */
import { requireSql, withTx } from "./db";
import { chatJson } from "./openrouter";
import { reserveCalls } from "./usage-counters";
import { getLimits } from "./usage";
import { captureError } from "./sentry";
import { resolveMarket } from "./markets";
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

interface BatchSource {
  id: string;
  title: string;
  url: string;
  cleaned_text: string | null;
  content_snippet: string | null;
  // Change detection (migration 0008). prior_cleaned_text holds the text
  // from BEFORE the most recent change; last_changed_at is stamped when the
  // hash flipped vs the previously stored hash. We treat a source as
  // "freshly changed in this scrape cycle" when last_changed_at is within
  // the last hour (cron + signals run back-to-back, so this is the cycle).
  prior_cleaned_text: string | null;
  last_changed_at: string | null;
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
 * sources. Idempotency: a re-run will surface new signals on top of existing
 * ones — we do not delete prior signals. Phase 5's daily summary regen IS
 * delete-then-insert; this is not.
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

  // Pull the most recent N sources that still have cleaned text — empty/blocked
  // pages are already filtered at scrape time (PRD §13.3), but we double-check.
  // prior_cleaned_text + last_changed_at come from migration 0008 — used below
  // to feed the model a before/after diff when a re-scrape changed the page.
  const sources = (await sql`
    SELECT id, title, url, cleaned_text, content_snippet,
           prior_cleaned_text, last_changed_at
    FROM sources
    WHERE project_id = ${projectId}
      AND cleaned_text IS NOT NULL
      AND length(cleaned_text) >= 200
    ORDER BY scraped_at DESC
    LIMIT ${MAX_SOURCES_PER_BATCH}
  `) as BatchSource[];

  if (sources.length === 0) {
    return { inserted: 0, rejected: 0, modelUsed: null, errors: ["no sources to analyze"] };
  }

  // A source is "freshly changed in this scrape cycle" when last_changed_at
  // is within the last hour. The cron + signals run back-to-back; for manual
  // refreshes the gap is seconds. One hour is generous enough to absorb any
  // re-queue while still avoiding re-emitting old change-signals on subsequent
  // days when nothing has actually changed since.
  const FRESH_CHANGE_WINDOW_MS = 60 * 60 * 1_000;
  const cycleCutoff = Date.now() - FRESH_CHANGE_WINDOW_MS;
  const isFreshlyChanged = (s: BatchSource): boolean =>
    !!s.last_changed_at &&
    !!s.prior_cleaned_text &&
    new Date(s.last_changed_at).getTime() >= cycleCutoff;

  // Build the prompt. The model receives source_id explicitly so it can
  // attribute each signal back to a specific row — we use this to drop
  // hallucinated/orphan signals on the way in. Sources whose content changed
  // since the last scrape also carry a before/after diff: text_before is the
  // previous cleaned_text, text is the new one. The model is told (system
  // rule 9) to compare them and emit a signal only when the change is
  // materially business-relevant.
  const sourcesJson = sources.map((s) => {
    const text = (s.cleaned_text || s.content_snippet || "").slice(0, MAX_CHARS_PER_SOURCE);
    const fresh = isFreshlyChanged(s);
    return fresh
      ? {
          source_id: s.id,
          title: s.title,
          url: s.url,
          text,
          changed_since_last_scrape: true,
          text_before: (s.prior_cleaned_text ?? "").slice(0, MAX_CHARS_PER_SOURCE),
        }
      : { source_id: s.id, title: s.title, url: s.url, text };
  });

  const companyBlock = project.track_company || project.company_name
    ? `Your company (${project.company_name || "unnamed"}, ${project.company_website || "no website"}): ${project.company_description || "(no description)"}`
    : "(No company profile — run on competitors and keywords only.)";

  // Resolve once so the prompt sees the canonical label ("Turkey", "Global",
  // "Latin America") rather than the dropdown code ("TR", "REGION_LATAM").
  const market = resolveMarket(project.target_market);

  const systemPrompt = [
    "You are Issuefy, a market-intelligence analyst that extracts actionable business signals from public web sources.",
    "Output strict JSON only — no prose, no markdown.",
    "Rules:",
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
    ai = await chatJson({
      schemaName: "issuefy_signals",
      jsonSchema: SIGNAL_JSON_SCHEMA,
      zodSchema: signalExtractionResponseSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2_500,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureError(e, { stage: "openrouter:signals", projectId });
    return { inserted: 0, rejected: 0, modelUsed: null, errors: [msg] };
  }

  // Reject any signal whose source_id wasn't in the batch we just sent —
  // those are model hallucinations and would otherwise orphan/contaminate.
  const validSourceIds = new Set(sources.map((s) => s.id));
  const accepted = ai.data.signals.filter((s) => validSourceIds.has(s.source_id));
  let rejected = ai.data.signals.length - accepted.length;

  // Per-project/day safety rail on signals (PRD §21.3).
  const todayCountRows = (await sql`
    SELECT COUNT(*)::int AS n FROM signals
    WHERE project_id = ${projectId} AND created_at >= date_trunc('day', now())
  `) as { n: number }[];
  let remainingToday = Math.max(0, limits.maxSignalsPerProjectPerDay - (todayCountRows[0]?.n ?? 0));
  if (accepted.length > remainingToday) rejected += accepted.length - remainingToday;
  const toInsert = accepted.slice(0, remainingToday);

  if (toInsert.length === 0) {
    return { inserted: 0, rejected, modelUsed: ai.modelUsed, errors };
  }

  // Write signals + signal_sources atomically. Bumping the signals_generated
  // counter happens outside the transaction so a duplicate-attribution conflict
  // doesn't double-count.
  let insertedIds: string[] = [];
  try {
    insertedIds = await withTx(async (client) => {
      const ids: string[] = [];
      for (const sig of toInsert) {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO signals
            (project_id, title, category, description, importance, confidence_score, suggested_action)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [projectId, sig.title, sig.category, sig.description, sig.importance, sig.confidence_score, sig.suggested_action || null],
        );
        const signalId = rows[0].id;
        await client.query(
          `INSERT INTO signal_sources (signal_id, source_id) VALUES ($1, $2)
           ON CONFLICT (signal_id, source_id) DO NOTHING`,
          [signalId, sig.source_id],
        );
        ids.push(signalId);
      }
      return ids;
    });
  } catch (e) {
    captureError(e, { stage: "insert:signals", projectId });
    return { inserted: 0, rejected, modelUsed: ai.modelUsed, errors: [e instanceof Error ? e.message : "insert failed"] };
  }

  // Bump the signals_generated usage counter (PRD §21.3 — value/fair-use limit).
  try {
    await reserveCalls(project.user_id, "signals_generated", insertedIds.length);
  } catch (e) {
    // Non-fatal: counter increment shouldn't roll back the writes.
    captureError(e, { stage: "increment:signals_generated", projectId });
  }

  return { inserted: insertedIds.length, rejected, modelUsed: ai.modelUsed, errors };
}
