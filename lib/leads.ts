/**
 * Lead Discovery engine.
 *
 * For each active keyword: search Reddit + Hacker News for recent posts,
 * ask the model which authors are plausible CUSTOMERS for the user's brand
 * (not generic chatter, news, or competitors), and store the qualifying ones
 * as keyword_leads. Reply drafts are generated on demand (draftLeadReply),
 * not at scan time — bounding token cost.
 *
 * Called by:
 *   - app/api/internal/lead-discovery (daily cron fan-out, one project/run)
 *   - app/api/projects/[id]/keywords/[keywordId]/find-leads (manual button)
 *
 * Fail-soft per keyword/platform: one bad search or classify never aborts the
 * rest of the project's scan.
 */
import { z } from "zod";
import { requireSql } from "./db";
import { chatJson } from "./openrouter";
import { reserveCalls } from "./usage-counters";
import { getLimits } from "./usage";
import { resolveMarket } from "./markets";
import { searchHackerNews, searchReddit, type RawLead } from "./lead-sources";
import { apifyEnabled } from "./apify";
import { captureBreadcrumb, captureError } from "./sentry";

const LOOKBACK_DAYS = 14;
const MAX_CANDIDATES_PER_KEYWORD = 15; // bound classification cost
const LEAD_SCORE_THRESHOLD = 55;
// The Reddit actor is slow + flaky, so we fetch it for all keywords up front,
// in parallel (small pool) under a hard wall-clock deadline, BEFORE the
// sequential classify loop — keeping the whole worker well under its 300s cap.
const REDDIT_POOL = 3;
const REDDIT_PHASE_DEADLINE_MS = 180_000;

export const LEAD_INTENTS = [
  "seeking_recommendation", "frustrated_with_tool", "asking_how_to",
  "comparing_options", "researching",
] as const;

export interface LeadTelemetry {
  keywordsScanned: number;
  candidates: number;
  leadsCreated: number;
  errors: string[];
}

interface ProjectProfile {
  id: string;
  user_id: string;
  plan: string;
  company_name: string | null;
  company_description: string | null;
  company_website: string | null;
  track_company: boolean;
  industry: string;
  business_type: string;
  target_market: string | null;
}

/* ─────────────────────────── classifier ─────────────────────────── */

const CLASSIFY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["leads"],
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "is_lead", "score", "intent", "reason"],
        properties: {
          ref: { type: "integer" },
          is_lead: { type: "boolean" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          intent: { type: "string", enum: LEAD_INTENTS as unknown as string[] },
          reason: { type: "string", minLength: 1, maxLength: 240 },
        },
      },
    },
  },
} as const;

const classifyZod = z.object({
  leads: z.array(z.object({
    ref: z.number().int(),
    is_lead: z.boolean(),
    score: z.number().int(),
    intent: z.string(),
    reason: z.string(),
  })),
});

function companyBlurb(p: ProjectProfile): string {
  if (p.track_company && (p.company_name || p.company_description)) {
    return `The user's brand: ${p.company_name || "(unnamed)"} — ${p.company_description || "no description"}${p.company_website ? ` (${p.company_website})` : ""}.`;
  }
  return `The user sells in the ${p.industry} space (${p.business_type}). (No detailed company profile — judge conservatively from industry + keyword.)`;
}

/* ─────────────────────────── orchestrator ─────────────────────────── */

/** Run `fn` over items with at most `poolSize` in flight at once. */
async function runPool<T>(items: T[], poolSize: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(poolSize, items.length) }, worker));
}

export async function discoverLeadsForProject(
  projectId: string,
  opts?: { onlyKeywordId?: string },
): Promise<LeadTelemetry> {
  const sql = requireSql();
  const t: LeadTelemetry = { keywordsScanned: 0, candidates: 0, leadsCreated: 0, errors: [] };

  const projRows = (await sql`
    SELECT p.id, p.user_id, u.plan, u.role AS owner_role,
           p.company_name, p.company_description, p.company_website, p.track_company,
           p.industry, p.business_type, p.target_market
    FROM projects p JOIN users u ON u.id = p.user_id
    WHERE p.id = ${projectId} AND p.is_active = true LIMIT 1
  `) as Array<ProjectProfile & { owner_role: string }>;
  const project = projRows[0];
  if (!project) { t.errors.push("project not found or paused"); return t; }
  const ownerIsAdmin = (project.owner_role ?? "user") === "admin";
  const limits = getLimits(project.plan);

  const keywords = (await sql`
    SELECT id, keyword FROM keywords
    WHERE project_id = ${projectId} AND is_active = true
      AND (${opts?.onlyKeywordId ?? null}::uuid IS NULL OR id = ${opts?.onlyKeywordId ?? null}::uuid)
  `) as Array<{ id: string; keyword: string }>;
  if (keywords.length === 0) return t;

  const sinceUnix = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86_400;
  const market = resolveMarket(project.target_market);
  const blurb = companyBlurb(project);

  // Phase A — when Apify is on, prefetch Reddit for every keyword in parallel
  // (small pool) under a hard deadline, since the actor is slow + flaky. Each
  // keyword defaults to [] so the loop below always finds an entry; late
  // completions after the deadline harmlessly overwrite unused slots. Without
  // Apify we fall through to the per-keyword searchReddit() in the loop.
  const useApify = apifyEnabled();
  const redditByKw = new Map<string, RawLead[]>(keywords.map((k) => [k.id, []]));
  if (useApify) {
    await Promise.race([
      runPool(keywords, REDDIT_POOL, async (kw) => {
        try {
          redditByKw.set(kw.id, await searchReddit(kw.keyword));
        } catch (e) {
          captureBreadcrumb("leads: reddit prefetch failed", {
            keyword: kw.keyword, msg: e instanceof Error ? e.message : "?",
          });
        }
      }),
      new Promise<void>((resolve) => setTimeout(resolve, REDDIT_PHASE_DEADLINE_MS)),
    ]);
  }

  for (const kw of keywords) {
    t.keywordsScanned++;
    try {
      // 1. Search both platforms (fail-soft each). Reddit is prefetched above
      //    when Apify is configured; otherwise call the public path inline.
      const reddit = useApify ? (redditByKw.get(kw.id) ?? []) : await searchReddit(kw.keyword);
      const hn = await searchHackerNews(kw.keyword, sinceUnix);
      let merged: RawLead[] = [...reddit, ...hn];
      if (merged.length === 0) continue;

      // 2. Drop posts already captured as leads for this keyword.
      const existing = (await sql`
        SELECT post_url FROM keyword_leads WHERE keyword_id = ${kw.id}
      `) as Array<{ post_url: string }>;
      const seen = new Set(existing.map((r) => r.post_url));
      merged = merged.filter((m) => !seen.has(m.postUrl));
      if (merged.length === 0) continue;

      // 3. Cap candidates (most recent first) to bound LLM cost.
      merged.sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));
      const candidates = merged.slice(0, MAX_CANDIDATES_PER_KEYWORD);
      t.candidates += candidates.length;

      // Budget gate (admins bypass).
      const after = await reserveCalls(project.user_id, "lead_scans", candidates.length);
      if (!ownerIsAdmin && after > limits.leadScansPerCycle) {
        t.errors.push("lead-scan budget reached — remaining keywords skipped");
        captureBreadcrumb("leads: budget reached", { projectId, userId: project.user_id });
        break;
      }

      // 4. Classify in one batched call.
      const lines = candidates.map((c, i) =>
        `[${i}] ${c.platform === "reddit" ? c.context : "Hacker News"} · by ${c.author || "unknown"}\n    ${c.title}\n    ${c.excerpt || "(no body)"}`,
      );
      const systemPrompt = [
        "You qualify social-media posts as potential SALES LEADS for a specific brand.",
        "A lead = the post AUTHOR is plausibly a buyer/evaluator for what the brand sells: asking for a recommendation, frustrated with a current tool, comparing options, asking how to solve a problem the brand addresses, or actively researching a purchase.",
        "NOT leads: general news/discussion, the brand's own competitors promoting themselves, job posts, memes, tutorials with no buyer, or posts unrelated to the brand's space. Be strict — false positives waste the user's time.",
        "Output strict JSON only: { \"leads\": [ { ref, is_lead, score, intent, reason } ] }.",
        "  - ref: the [n] of the post.",
        "  - is_lead: true only for genuine buying-intent leads.",
        "  - score: 0-100 confidence the author is a reachable potential customer.",
        `  - intent: one of ${LEAD_INTENTS.join(", ")}.`,
        "  - reason: one sentence on why (or why not) — name the buying signal.",
        "Return an entry for every ref. If none qualify, set is_lead=false for all.",
      ].join("\n");
      const userPrompt = [
        blurb,
        `Industry: ${project.industry} · Target market: ${market.canonicalName}`,
        `Keyword being tracked: "${kw.keyword}"`,
        "",
        "Candidate posts:",
        ...lines,
        "",
        "Return strict JSON: { \"leads\": [ { ref, is_lead, score, intent, reason } ] }",
      ].join("\n");

      let result;
      try {
        result = await chatJson({
          schemaName: "issuefy_lead_classify",
          jsonSchema: CLASSIFY_JSON_SCHEMA,
          zodSchema: classifyZod,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 1_200,
          temperature: 0.1,
        });
      } catch (e) {
        t.errors.push(`classify:${kw.keyword}: ${e instanceof Error ? e.message : "failed"}`);
        captureError(e, { stage: "leads.classify", projectId, keyword: kw.keyword });
        continue;
      }

      // 5. Store qualifying leads.
      for (const v of result.data.leads) {
        if (!v.is_lead || v.score < LEAD_SCORE_THRESHOLD) continue;
        const c = candidates[v.ref];
        if (!c) continue;
        const intent = (LEAD_INTENTS as readonly string[]).includes(v.intent) ? v.intent : "researching";
        const ins = (await sql`
          INSERT INTO keyword_leads
            (project_id, keyword_id, platform, post_url, post_title, post_excerpt,
             author, author_url, context, posted_at, engagement, lead_score, intent, reason)
          VALUES
            (${projectId}, ${kw.id}, ${c.platform}, ${c.postUrl}, ${c.title}, ${c.excerpt || null},
             ${c.author}, ${c.authorUrl}, ${c.context}, ${c.postedAt}, ${c.engagement},
             ${Math.max(0, Math.min(100, v.score))}, ${intent}, ${v.reason.slice(0, 240)})
          ON CONFLICT (keyword_id, post_url) DO NOTHING
          RETURNING id
        `) as Array<{ id: string }>;
        if (ins.length > 0) t.leadsCreated++;
      }
    } catch (e) {
      t.errors.push(`keyword:${kw.keyword}: ${e instanceof Error ? e.message : "failed"}`);
      captureError(e, { stage: "leads.keyword", projectId, keyword: kw.keyword });
    }
  }

  return t;
}

/* ─────────────────────────── reply drafting ─────────────────────────── */

const REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply_text"],
  properties: { reply_text: { type: "string", minLength: 1, maxLength: 1500 } },
} as const;
const replyZod = z.object({ reply_text: z.string().min(1) });

/**
 * Generate (and persist) a suggested reply for one lead. On-demand only.
 * The reply is a SUGGESTION the user posts manually — the prompt forbids
 * spam / overt shilling so it reads as a real human being helpful.
 */
export async function draftLeadReply(leadId: string, projectId: string): Promise<{ reply: string }> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT kl.id, kl.platform, kl.context, kl.post_title, kl.post_excerpt, kl.intent,
           p.company_name, p.company_description, p.company_website, p.track_company,
           p.industry, p.business_type, p.target_market
    FROM keyword_leads kl JOIN projects p ON p.id = kl.project_id
    WHERE kl.id = ${leadId} AND kl.project_id = ${projectId} LIMIT 1
  `) as Array<{
    id: string; platform: string; context: string; post_title: string; post_excerpt: string | null;
    intent: string | null; company_name: string | null; company_description: string | null;
    company_website: string | null; track_company: boolean; industry: string;
    business_type: string; target_market: string | null;
  }>;
  const lead = rows[0];
  if (!lead) throw new Error("lead not found");

  const isReddit = lead.platform === "reddit";
  const brand = lead.track_company && (lead.company_name || lead.company_description)
    ? `You represent ${lead.company_name || "the brand"}${lead.company_website ? ` (${lead.company_website})` : ""}: ${lead.company_description || ""}`
    : `You work in the ${lead.industry} space (${lead.business_type}).`;

  const systemPrompt = [
    `You draft a reply the user can post on ${isReddit ? `Reddit (${lead.context})` : "Hacker News"} to a potential customer.`,
    brand,
    "Rules:",
    `  1. Voice: ${isReddit ? "casual, peer-to-peer, genuinely helpful — Redditors despise shills." : "substantive and technical — HN values depth and honesty."}`,
    "  2. LEAD WITH VALUE: directly help with what they actually asked. Be specific and useful even if they never buy.",
    "  3. Mention the brand at most once, only if naturally relevant, and disclose the affiliation plainly (e.g. 'disclosure: I work on X'). If a mention would feel forced, omit it entirely.",
    "  4. No marketing speak, no hard sell, no links unless they directly answer the question. 60-140 words.",
    "  5. Output strict JSON only: { \"reply_text\": \"...\" }.",
  ].join("\n");
  const userPrompt = [
    `Their post${lead.intent ? ` (intent: ${lead.intent})` : ""}:`,
    `Title: ${lead.post_title}`,
    `Body: ${lead.post_excerpt || "(no body — reply to the title)"}`,
    "",
    "Return strict JSON: { \"reply_text\": \"...\" }",
  ].join("\n");

  const ai = await chatJson({
    schemaName: "issuefy_lead_reply",
    jsonSchema: REPLY_JSON_SCHEMA,
    zodSchema: replyZod,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 500,
    temperature: 0.5,
  });

  await sql`
    UPDATE keyword_leads SET draft_reply = ${ai.data.reply_text}, draft_model = ${ai.modelUsed}, updated_at = now()
    WHERE id = ${leadId}
  `;
  return { reply: ai.data.reply_text };
}
