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
// A conversation only qualifies if recommending the user's product there would
// be natural — a high bar, on purpose: the user wants a few great opportunities,
// not many mediocre ones. This is also the floor used when DISPLAYING rows
// (queries in the leads page / keyword page / badge filter on lead_score), so
// older low-relevance rows from looser scans drop out of view automatically.
export const LEAD_SCORE_THRESHOLD = 70;
const MAX_LEADS_PER_KEYWORD = 8; // hard ceiling per keyword per scan
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

type ClassifyVerdict = { ref: number; is_lead: boolean; score: number; intent: string; reason: string };
interface ClassifyCand {
  platform: string; context: string; title: string; excerpt: string | null; author: string | null;
}

/**
 * The single source of truth for "is this a post where we could naturally
 * recommend the user's product?" — used by the live scan AND by the
 * re-classification pass over already-stored rows. One batched LLM call.
 */
async function classifyForRecommendation(
  project: ProjectProfile, keywordLabel: string, cands: ClassifyCand[],
): Promise<ClassifyVerdict[]> {
  const market = resolveMarket(project.target_market);
  const blurb = companyBlurb(project);
  const lines = cands.map((c, i) =>
    `[${i}] ${c.platform === "reddit" ? c.context : "Hacker News"} · by ${c.author || "unknown"}\n    ${c.title}\n    ${c.excerpt || "(no body)"}`,
  );
  const systemPrompt = [
    "You find posts where the user's brand (described below) could be NATURALLY RECOMMENDED in a reply — and reject everything else. The user will read each match and, if it fits, post a reply suggesting their product. So the only useful posts are ones where dropping in to recommend the product would be genuinely welcome and on-topic.",
    "Mark is_lead=true ONLY when ALL of these hold:",
    "  • The author is actively looking for the kind of solution the brand provides — asking for a tool/recommendation, frustrated with an alternative, comparing options, or asking how to solve a problem the brand directly solves.",
    "  • The brand is a REAL, specific fit for their stated need — not just loosely in the same industry/topic.",
    "  • A reply recommending the brand would read as a helpful peer suggestion, not an ad or an off-topic plug.",
    "Reject (is_lead=false): general discussion or news, people already settled on another tool, the brand's competitors promoting themselves, job/hiring posts, memes, tutorials, show-and-tell with no need, students/career questions, and anything where a recommendation would feel forced. When unsure, REJECT.",
    "Be very strict — the user wants a FEW excellent opportunities, not many mediocre ones. It is normal for most or all posts to be is_lead=false.",
    "Output strict JSON only: { \"leads\": [ { ref, is_lead, score, intent, reason } ] }.",
    "  - ref: the [n] of the post.",
    "  - is_lead: true only if you could write a natural reply recommending THIS brand's product there.",
    "  - score: 0-100 = how natural and strong the recommendation opportunity is. Reserve 80+ for posts explicitly asking for a recommendation the brand clearly fits; use <70 for anything you're not confident about (those won't be shown).",
    `  - intent: one of ${LEAD_INTENTS.join(", ")}.`,
    "  - reason: one sentence naming the recommendation angle — what you'd suggest and why it fits their need.",
    "Return an entry for every ref.",
  ].join("\n");
  const userPrompt = [
    blurb,
    `Industry: ${project.industry} · Target market: ${market.canonicalName}`,
    `Topic being tracked: "${keywordLabel}"`,
    "",
    "Candidate posts — for each, judge whether you could naturally recommend the brand in a reply:",
    ...lines,
    "",
    "Return strict JSON: { \"leads\": [ { ref, is_lead, score, intent, reason } ] }",
  ].join("\n");

  const result = await chatJson({
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
  return result.data.leads;
}

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

      // 4. Classify in one batched call (shared with the re-classification pass).
      let verdicts: ClassifyVerdict[];
      try {
        verdicts = await classifyForRecommendation(project, kw.keyword, candidates);
      } catch (e) {
        t.errors.push(`classify:${kw.keyword}: ${e instanceof Error ? e.message : "failed"}`);
        captureError(e, { stage: "leads.classify", projectId, keyword: kw.keyword });
        continue;
      }

      // 5. Store qualifying matches — strict threshold, only the few best per keyword.
      const qualifying = verdicts
        .filter((v) => v.is_lead && v.score >= LEAD_SCORE_THRESHOLD && candidates[v.ref])
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_LEADS_PER_KEYWORD);
      for (const v of qualifying) {
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

export interface ReclassifyResult {
  projectId: string;
  scanned: number;     // un-acted-on leads re-judged
  kept: number;        // still qualify (score updated)
  dismissed: number;   // no longer qualify → status='dismissed' (reversible)
  errors: string[];
}

/**
 * Re-judge already-stored, un-acted-on ('new') leads with the current strict
 * classifier and DISMISS the ones that no longer qualify (reversible — the user
 * can Undo). Qualifying rows get their score/intent/reason refreshed. Uses only
 * stored post text, so it costs no scraping — just a few LLM calls. Run after
 * tightening the classifier so the existing inbox reflects the new bar.
 */
export async function reclassifyExistingLeads(projectId: string): Promise<ReclassifyResult> {
  const sql = requireSql();
  const res: ReclassifyResult = { projectId, scanned: 0, kept: 0, dismissed: 0, errors: [] };

  const projRows = (await sql`
    SELECT p.id, p.user_id, u.plan, u.role AS owner_role,
           p.company_name, p.company_description, p.company_website, p.track_company,
           p.industry, p.business_type, p.target_market
    FROM projects p JOIN users u ON u.id = p.user_id
    WHERE p.id = ${projectId} LIMIT 1
  `) as Array<ProjectProfile & { owner_role: string }>;
  const project = projRows[0];
  if (!project) { res.errors.push("project not found"); return res; }

  const rows = (await sql`
    SELECT kl.id, kl.keyword_id, k.keyword, kl.platform, kl.context,
           kl.post_title, kl.post_excerpt, kl.author
    FROM keyword_leads kl JOIN keywords k ON k.id = kl.keyword_id
    WHERE kl.project_id = ${projectId} AND kl.status = 'new'
    ORDER BY kl.keyword_id
  `) as Array<{
    id: string; keyword_id: string; keyword: string; platform: string; context: string;
    post_title: string; post_excerpt: string | null; author: string | null;
  }>;

  // Group by keyword, then classify in batches (same cap as the live scan).
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = groups.get(r.keyword_id);
    if (arr) arr.push(r); else groups.set(r.keyword_id, [r]);
  }

  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += MAX_CANDIDATES_PER_KEYWORD) {
      const batch = group.slice(i, i + MAX_CANDIDATES_PER_KEYWORD);
      const cands: ClassifyCand[] = batch.map((l) => ({
        platform: l.platform, context: l.context, title: l.post_title, excerpt: l.post_excerpt, author: l.author,
      }));
      let verdicts: ClassifyVerdict[];
      try {
        verdicts = await classifyForRecommendation(project, batch[0].keyword, cands);
      } catch (e) {
        res.errors.push(`classify:${batch[0].keyword}: ${e instanceof Error ? e.message : "failed"}`);
        continue;
      }
      const byRef = new Map(verdicts.map((v) => [v.ref, v]));
      for (let j = 0; j < batch.length; j++) {
        res.scanned++;
        const lead = batch[j];
        const v = byRef.get(j);
        if (v && v.is_lead && v.score >= LEAD_SCORE_THRESHOLD) {
          const intent = (LEAD_INTENTS as readonly string[]).includes(v.intent) ? v.intent : "researching";
          await sql`
            UPDATE keyword_leads
            SET lead_score = ${Math.max(0, Math.min(100, v.score))}, intent = ${intent}, reason = ${v.reason.slice(0, 240)}
            WHERE id = ${lead.id} AND status = 'new'
          `;
          res.kept++;
        } else {
          await sql`UPDATE keyword_leads SET status = 'dismissed' WHERE id = ${lead.id} AND status = 'new'`;
          res.dismissed++;
        }
      }
    }
  }
  return res;
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
    `You draft a reply the user can post on ${isReddit ? `Reddit (${lead.context})` : "Hacker News"} that naturally RECOMMENDS their product to this poster.`,
    brand,
    "The whole point of this reply is to suggest the user's product as a fitting solution — written like a helpful real user who happens to know the product, NOT a generic answer that ignores it and NOT an ad.",
    "Rules:",
    `  1. Voice: ${isReddit ? "casual, peer-to-peer — Redditors downvote anything that smells like marketing, so earn it." : "substantive and technical — HN values honesty and specifics."}`,
    "  2. Open by engaging with their specific situation in a sentence, then recommend the product by name and say in one line WHY it fits what they asked for.",
    "  3. Disclose the affiliation plainly and briefly (e.g. 'disclosure: I work on it'). Be honest and specific; never invent features or over-claim.",
    "  4. No marketing speak, no hype, no multiple pitches. At most one link, only if it directly helps. 50-130 words, one short paragraph.",
    "  5. Output strict JSON only: { \"reply_text\": \"...\" }.",
  ].join("\n");
  const userPrompt = [
    `The poster's post${lead.intent ? ` (intent: ${lead.intent})` : ""} — recommend the product as a fit for this:`,
    `Title: ${lead.post_title}`,
    `Body: ${lead.post_excerpt || "(no body — work from the title)"}`,
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
