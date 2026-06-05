/**
 * Daily summary generation (PRD §13.6 / §16.2).
 *
 * One short paragraph (80–140 words) summarizing the most important recent
 * signals for one project, with related clickable sources. UPSERTED on
 * (project_id, summary_date) — so the row is created on the daily scrape and
 * REGENERATED in place when a manual refresh fires later the same day.
 *
 *  - summary_date is a fixed-timezone calendar date (UTC) → daily cron and
 *    manual refresh agree on what "today" is even at midnight boundaries.
 *  - Word-count gate: if the model returns <80 or >140 words, we retry ONCE
 *    with an explicit "shorter/longer" instruction. If the second attempt
 *    still fails the gate, we store it anyway and log (per build plan) —
 *    a dashboard with a 78-word summary is still better than an empty card.
 *  - daily_summary_sources is delete-then-insert on regen so the View Sources
 *    button always reflects the latest summary's citations.
 */
import { requireSql, withTx } from "./db";
import { chatJson } from "./openrouter";
import { captureError } from "./sentry";
import {
  dailySummaryResponseSchema,
  type DailySummaryResponse,
} from "./schemas/ai";

interface ProjectContext {
  id: string;
  user_id: string;
  name: string;
  company_name: string | null;
  company_website: string | null;
  company_description: string | null;
  track_company: boolean;
  industry: string;
  business_type: string;
  target_market: string;
}

interface RecentSignal {
  id: string;
  title: string;
  category: string;
  description: string;
  importance: string;
  confidence_score: number | null;
}

interface RecentSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  content_snippet: string | null;
}

export interface GenerateDailySummaryResult {
  /** "created" on first run today, "updated" on regen, "skipped" when there's nothing to summarize. */
  status: "created" | "updated" | "skipped";
  summaryDate: string;
  summaryText: string;
  sourceIds: string[];
  wordCount: number;
  wordCountInRange: boolean;
  modelUsed: string | null;
  errors: string[];
}

const MIN_WORDS = 80;
const MAX_WORDS = 140;
const MAX_SIGNALS_IN_PROMPT = 12;
const MAX_SOURCES_IN_PROMPT = 12;

const DAILY_SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary_text", "source_ids"],
  properties: {
    summary_text: { type: "string", minLength: 1, maxLength: 2_000 },
    source_ids: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

export function todayUtcDate(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function wordsOf(text: string): number {
  // Match Unicode-ish word tokens — strips punctuation around words.
  return (text.match(/\p{L}[\p{L}\p{N}'-]*/gu) || []).length;
}

/**
 * Generate (or regenerate) today's daily summary for one project.
 * Returns the resulting row's data + telemetry. Throws only on infrastructure
 * errors (DB unreachable); all model + content issues are returned as errors.
 */
export async function generateDailySummaryForProject(projectId: string): Promise<GenerateDailySummaryResult> {
  const sql = requireSql();
  const summaryDate = todayUtcDate();
  const errors: string[] = [];

  const projRows = (await sql`
    SELECT id, user_id, name, company_name, company_website, company_description,
           track_company, industry, business_type, target_market
    FROM projects WHERE id = ${projectId} LIMIT 1
  `) as ProjectContext[];
  const project = projRows[0];
  if (!project) throw new Error(`generateDailySummary: project ${projectId} not found`);

  // The most recent live signals (excluding dismissed) — that's what "today"
  // is about. PRD §13.6: summarize the most important RECENT signals.
  const signals = (await sql`
    SELECT id, title, category, description, importance, confidence_score
    FROM signals
    WHERE project_id = ${projectId}
      AND dismissed_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${MAX_SIGNALS_IN_PROMPT}
  `) as RecentSignal[];

  const sources = (await sql`
    SELECT id, title, url, domain, content_snippet
    FROM sources
    WHERE project_id = ${projectId}
      AND scraped_at >= now() - interval '7 days'
    ORDER BY scraped_at DESC
    LIMIT ${MAX_SOURCES_IN_PROMPT}
  `) as RecentSource[];

  if (signals.length === 0 && sources.length === 0) {
    // PRD §13.6 empty state — we still write a row so the dashboard can render
    // a stable card; the worker can decide whether to skip. Here we just
    // signal "skipped" and let the caller handle it.
    return {
      status: "skipped",
      summaryDate,
      summaryText: "",
      sourceIds: [],
      wordCount: 0,
      wordCountInRange: false,
      modelUsed: null,
      errors: ["no signals or sources to summarize"],
    };
  }

  const companyBlock = project.track_company || project.company_name
    ? `Your company (${project.company_name || "unnamed"}, ${project.company_website || "no website"}): ${project.company_description || "(no description)"}`
    : "(No company profile — assess relative to competitors and keywords only.)";

  const signalsBlock = signals.length
    ? signals.map((s, i) => `${i + 1}. [${s.category} · ${s.importance}] ${s.title}: ${s.description}`).join("\n")
    : "(No live signals — base the summary on the source snippets below.)";

  const sourcesBlock = sources.map((s) => ({
    source_id: s.id,
    title: s.title,
    domain: s.domain,
    snippet: (s.content_snippet || "").slice(0, 400),
  }));

  const systemPrompt = [
    "You are Issuefy, writing the daily AI market briefing for one user's project.",
    "Output strict JSON ONLY — no prose, no markdown.",
    "Rules:",
    "  1. summary_text MUST be ONE paragraph between 80 and 140 words. No bullets, no lists, no headings.",
    "  2. Summarize the most important recent signals — what changed, what matters, what to watch.",
    "  3. Include ONE simple recommended action when possible.",
    "  4. Use ONLY facts present in the signals and source snippets. Do not invent.",
    "  5. source_ids: include 2-5 source_id values from the sources block that DIRECTLY support claims in the summary.",
    "  6. If there's not enough data, say so clearly — do not fabricate context.",
    "  7. When a company profile is provided, frame opportunities and risks RELATIVE TO that company.",
  ].join("\n");

  const baseUser = [
    `Project: ${project.name}`,
    `Industry: ${project.industry}`,
    `Business type: ${project.business_type}`,
    `Target market: ${project.target_market}`,
    companyBlock,
    "",
    "Recent signals:",
    signalsBlock,
    "",
    "Sources:",
    JSON.stringify(sourcesBlock, null, 2),
    "",
    "Return strict JSON: { \"summary_text\": \"...\", \"source_ids\": [\"...\"] }",
  ].join("\n");

  const allowedSourceIds = new Set(sources.map((s) => s.id));

  let modelUsed: string | null = null;
  let summary: DailySummaryResponse | null = null;
  let wordCount = 0;

  const tryGenerate = async (extraInstruction?: string) => {
    const userPrompt = extraInstruction ? `${baseUser}\n\nIMPORTANT: ${extraInstruction}` : baseUser;
    const ai = await chatJson({
      schemaName: "issuefy_daily_summary",
      jsonSchema: DAILY_SUMMARY_JSON_SCHEMA,
      zodSchema: dailySummaryResponseSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 600,
      temperature: 0.2,
    });
    modelUsed = ai.modelUsed;
    return ai.data;
  };

  try {
    summary = await tryGenerate();
    wordCount = wordsOf(summary.summary_text);

    // Single retry with a tighter instruction if the gate failed.
    if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
      const drift = wordCount < MIN_WORDS
        ? `Your previous response was ${wordCount} words — too short. Expand to between ${MIN_WORDS} and ${MAX_WORDS} words.`
        : `Your previous response was ${wordCount} words — too long. Tighten to between ${MIN_WORDS} and ${MAX_WORDS} words.`;
      errors.push(`word-count drift (${wordCount}); retrying once`);
      summary = await tryGenerate(drift);
      wordCount = wordsOf(summary.summary_text);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureError(e, { stage: "openrouter:summary", projectId });
    return {
      status: "skipped",
      summaryDate,
      summaryText: "",
      sourceIds: [],
      wordCount: 0,
      wordCountInRange: false,
      modelUsed,
      errors: [...errors, msg],
    };
  }

  // Drop any hallucinated source IDs that weren't in the batch we sent.
  const validSourceIds = (summary.source_ids || []).filter((id) => allowedSourceIds.has(id));
  if (validSourceIds.length !== summary.source_ids.length) {
    errors.push(`dropped ${summary.source_ids.length - validSourceIds.length} hallucinated source_id(s)`);
  }

  // Upsert + delete-then-insert sources atomically. The unique constraint on
  // (project_id, summary_date) makes the ON CONFLICT the regen path —
  // returning the row id whether INSERT or UPDATE took effect.
  const wordCountInRange = wordCount >= MIN_WORDS && wordCount <= MAX_WORDS;
  if (!wordCountInRange) {
    errors.push(`final word-count out of range: ${wordCount}; stored anyway per build plan`);
  }

  let summaryId: string;
  let status: "created" | "updated";
  try {
    const result = await withTx(async (client) => {
      const { rows: upsertRows } = await client.query<{ id: string; xmax: string }>(
        `INSERT INTO daily_summaries (project_id, summary_date, summary_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, summary_date) DO UPDATE
           SET summary_text = EXCLUDED.summary_text,
               updated_at   = now()
         RETURNING id, xmax::text`,
        [projectId, summaryDate, summary.summary_text],
      );
      const id = upsertRows[0].id;
      // xmax = "0" on a fresh insert; non-zero when the DO UPDATE path fired.
      const wasInsert = upsertRows[0].xmax === "0";
      // Always refresh the source citations on regen.
      await client.query(`DELETE FROM daily_summary_sources WHERE daily_summary_id = $1`, [id]);
      for (const srcId of validSourceIds) {
        await client.query(
          `INSERT INTO daily_summary_sources (daily_summary_id, source_id) VALUES ($1, $2)
           ON CONFLICT (daily_summary_id, source_id) DO NOTHING`,
          [id, srcId],
        );
      }
      return { id, wasInsert };
    });
    summaryId = result.id;
    status = result.wasInsert ? "created" : "updated";
  } catch (e) {
    captureError(e, { stage: "insert:daily_summary", projectId });
    return {
      status: "skipped",
      summaryDate,
      summaryText: summary.summary_text,
      sourceIds: validSourceIds,
      wordCount,
      wordCountInRange,
      modelUsed,
      errors: [...errors, e instanceof Error ? e.message : "summary upsert failed"],
    };
  }
  void summaryId;

  return {
    status,
    summaryDate,
    summaryText: summary.summary_text,
    sourceIds: validSourceIds,
    wordCount,
    wordCountInRange,
    modelUsed,
    errors,
  };
}
