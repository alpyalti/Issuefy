/**
 * Keyword translation for multilingual SERP discovery.
 *
 * For non-English target markets, each project keyword is also queried in
 * the local language(s). We translate via OpenRouter chatJson (strict JSON
 * schema) and cache per (keyword, lang) in keyword_translations so the daily
 * scrape only pays the LLM cost once per pair. Cache hits are free; misses
 * cost one cheap chatJson call (~100 tokens).
 *
 * Neon HTTP driver — no transactions. Cache insert uses ON CONFLICT DO
 * NOTHING for race safety.
 *
 * Fail-soft everywhere: any error returns the raw English keyword so the
 * caller never has to handle null.
 */
import { z } from "zod";
import { requireSql } from "./db";
import { chatJson } from "./openrouter";
import { captureBreadcrumb, captureError } from "./sentry";

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translation"],
  properties: {
    translation: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

const responseZod = z.object({
  translation: z.string().min(1).max(200),
});

/** Lowercase + collapse whitespace for stable cache lookup. */
function normalizeKeyword(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Translate a keyword to `lang` (ISO 639-1). Returns the local-language
 * form, or the original keyword on any failure. Cached forever per
 * (keyword, lang).
 *
 *   - lang === "en"  → returns rawKeyword immediately (no LLM, no cache).
 *   - cache hit       → returns cached translation.
 *   - cache miss      → calls OpenRouter, writes ON CONFLICT DO NOTHING.
 */
export async function translateKeyword(
  rawKeyword: string,
  lang: string,
): Promise<string> {
  if (lang === "en") return rawKeyword;
  const sql = requireSql();
  const key = normalizeKeyword(rawKeyword);

  // Cache check.
  let cached: { translation: string }[] = [];
  try {
    cached = (await sql`
      SELECT translation FROM keyword_translations
       WHERE keyword = ${key} AND lang = ${lang}
       LIMIT 1
    `) as { translation: string }[];
  } catch (e) {
    captureBreadcrumb("translation: cache read failed", {
      keyword: key, lang, msg: e instanceof Error ? e.message : "?",
    });
  }
  if (cached[0]?.translation) return cached[0].translation;

  // Cache miss — translate.
  let translated = rawKeyword;
  let modelUsed: string | null = null;
  try {
    const ai = await chatJson({
      schemaName: "issuefy_keyword_translation",
      jsonSchema: RESPONSE_JSON_SCHEMA,
      zodSchema: responseZod,
      maxTokens: 80,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You translate short business / marketing search keywords from English into a target language.",
            "Output strict JSON only: { \"translation\": \"...\" }.",
            "Rules:",
            "  1. Translate the MEANING, preserving the search intent — not a word-for-word translation.",
            "  2. Keep brand names, product names, and universal acronyms (SaaS, CRM, AI, B2B, SEO) in their original form.",
            "  3. Return the natural search phrase a native speaker would type into Google. No quotes, no punctuation, no extra words.",
            "  4. If the input is already in the target language or genuinely untranslatable, return it unchanged.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Target language (ISO 639-1): ${lang}\nKeyword: ${rawKeyword}`,
        },
      ],
    });
    translated = ai.data.translation.trim() || rawKeyword;
    modelUsed = ai.modelUsed;
  } catch (e) {
    captureError(e, { stage: "translation:chatJson", keyword: key, lang });
    return rawKeyword; // fail-soft
  }

  // Race-safe cache write. Neon HTTP — single statement, no tx.
  try {
    await sql`
      INSERT INTO keyword_translations (keyword, lang, translation, model_used)
      VALUES (${key}, ${lang}, ${translated}, ${modelUsed})
      ON CONFLICT (keyword, lang) DO NOTHING
    `;
  } catch (e) {
    captureBreadcrumb("translation: cache write failed", {
      keyword: key, lang, msg: e instanceof Error ? e.message : "?",
    });
  }
  return translated;
}
