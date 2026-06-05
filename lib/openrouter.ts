/**
 * OpenRouter client — single low-cost primary model with a fallback (PRD §10.8).
 *
 * We call POST /api/v1/chat/completions with two cost-control levers:
 *
 *  - `response_format: { type: "json_schema", json_schema: { strict: true, ... } }`
 *    forces the model to emit valid JSON matching our schema. This is more
 *    reliable than `{ type: "json_object" }` and pairs with our Zod validator
 *    as the real contract (PRD §10.9 — reject + log malformed output).
 *
 *  - `models: [PRIMARY, FALLBACK]` lets OpenRouter auto-retry the next model
 *    on errors/rate limits. The actual model used is returned in the response
 *    body and surfaced back to the caller.
 *
 * The HTTP-Referer and X-Title headers are required for OpenRouter's
 * leaderboard/attribution; harmless to send always.
 */

import { z } from "zod";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;

function ensureKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is not configured");
  return k;
}

export interface ChatJsonOptions<T> {
  /** OpenAI-style message array. System + user; we don't use the assistant role here. */
  messages: { role: "system" | "user"; content: string }[];
  /** Schema name shown to the model — keep short and descriptive. */
  schemaName: string;
  /** A JSON Schema (object form) describing the expected output exactly. */
  jsonSchema: Record<string, unknown>;
  /** Zod schema that mirrors `jsonSchema` — validates after parse, regardless of model claims. */
  zodSchema: z.ZodType<T>;
  /** Cap on output tokens. Defaults to 2000 — enough for ~10 signals or one summary. */
  maxTokens?: number;
  /** Defaults to 0.2 — we want deterministic, factual output. */
  temperature?: number;
}

export interface ChatJsonResult<T> {
  data: T;
  modelUsed: string;
}

/**
 * Call OpenRouter with strict JSON output + Zod validation. Returns the
 * validated payload AND the model that produced it (for telemetry). Throws on:
 *   - unconfigured API key
 *   - HTTP error from OpenRouter
 *   - empty / non-JSON content
 *   - Zod schema mismatch
 *
 * Callers (signal extraction, daily summary) handle the throw by logging the
 * raw response and skipping the result — never storing malformed AI output.
 */
export async function chatJson<T>(opts: ChatJsonOptions<T>): Promise<ChatJsonResult<T>> {
  const key = ensureKey();
  const primary = process.env.OPENROUTER_MODEL_PRIMARY || "google/gemini-2.0-flash-001";
  const fallback = process.env.OPENROUTER_MODEL_FALLBACK || "openai/gpt-4o-mini";

  const body = {
    model: primary,
    models: [primary, fallback].filter(Boolean),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2_000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: opts.schemaName,
        strict: true,
        schema: opts.jsonSchema,
      },
    },
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://issuefy.app",
        "X-Title": "Issuefy",
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 500)}`);
  }

  const payload = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };
  const modelUsed = payload.model || primary;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenRouter returned non-JSON content: ${content.slice(0, 200)}`);
  }

  const result = opts.zodSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`OpenRouter response failed schema validation: ${JSON.stringify(result.error.issues).slice(0, 500)}`);
  }
  return { data: result.data, modelUsed };
}
