import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { chatJson } from "@/lib/openrouter";
import { json, parseJson, rateLimited } from "@/lib/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";

/**
 * POST /api/recommend-competitors — given a company profile (collected during
 * onboarding, before the project exists), ask the model for 2-3 REAL direct
 * competitors. Pure LLM call (no scrape budget spent) — the onboarding UI
 * enriches a suggestion only when the user accepts it.
 *
 * Returns { competitors: [{ name, website, reason }] } with bare-domain
 * websites, de-duped and filtered against the caller's exclude list + own
 * domain. Degrades to an empty list on any error so onboarding never blocks.
 */
const bodySchema = z.object({
  company_name: z.string().trim().max(160).optional(),
  company_website: z.string().trim().max(2_048).optional(),
  company_description: z.string().trim().max(1_000).optional(),
  industry: z.string().trim().max(160).optional(),
  business_type: z.string().trim().max(80).optional(),
  target_market: z.string().trim().max(200).optional(),
  exclude: z.array(z.string().trim().max(200)).max(30).optional(),
}).strict();

const RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["competitors"],
  properties: {
    competitors: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "website", "reason"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          website: { type: "string", minLength: 3, maxLength: 200 },
          reason: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
    },
  },
} as const;

const resultZod = z.object({
  competitors: z.array(z.object({
    name: z.string(),
    website: z.string(),
    reason: z.string(),
  })),
});

// Process-local soft rate limit — one LLM call every few seconds per user.
const lastAttempt = new Map<string, number>();

function normalizeDomain(raw: string): string {
  let s = (raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s;
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  const last = lastAttempt.get(user.id) ?? 0;
  if (Date.now() - last < 3_000) return rateLimited("Give that a moment.");
  lastAttempt.set(user.id, Date.now());

  const profileLines = [
    body.company_name ? `Company: ${body.company_name}` : null,
    body.company_website ? `Website: ${body.company_website}` : null,
    body.company_description ? `What they do: ${body.company_description}` : null,
    body.industry ? `Industry: ${body.industry}` : null,
    body.business_type ? `Business type: ${body.business_type}` : null,
    body.target_market ? `Target market: ${body.target_market}` : null,
  ].filter(Boolean).join("\n");

  // Nothing to go on — return empty rather than guessing blindly.
  if (!profileLines) return json({ competitors: [] });

  const excludeList = (body.exclude || []).join(", ");

  const systemPrompt = [
    "You are a market analyst. Given a company, identify its closest REAL, currently-operating direct competitors.",
    "Output strict JSON only — no prose.",
    "Rules:",
    "  1. Only include companies you are confident actually exist today. Never invent companies or domains.",
    "  2. Give each company's primary website as a bare domain (e.g. \"asana.com\") — no https://, no path.",
    "  3. Prefer direct competitors serving the same market/segment as the company described.",
    "  4. Do NOT include the user's own company.",
    "  5. reason: at most 15 words on why it competes.",
    "  6. Return the 2-3 most relevant competitors, best first.",
  ].join("\n");

  const userPrompt = [
    "Company profile:",
    profileLines,
    excludeList ? `\nDo not suggest these (already added, or the user's own company): ${excludeList}` : "",
    "\nReturn the 2-3 most relevant direct competitors as JSON.",
  ].join("\n");

  try {
    const { data } = await chatJson({
      schemaName: "competitor_recommendations",
      jsonSchema: RESULT_JSON_SCHEMA,
      zodSchema: resultZod,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 500,
      temperature: 0.3,
    });

    const excludeSet = new Set((body.exclude || []).map(normalizeDomain).filter(Boolean));
    if (body.company_website) excludeSet.add(normalizeDomain(body.company_website));

    const seen = new Set<string>();
    const out: { name: string; website: string; reason: string }[] = [];
    for (const c of data.competitors) {
      const domain = normalizeDomain(c.website);
      const name = c.name.trim();
      if (!domain || !name || excludeSet.has(domain) || seen.has(domain)) continue;
      seen.add(domain);
      out.push({ name, website: domain, reason: c.reason.trim() });
      if (out.length >= 3) break;
    }
    return json({ competitors: out });
  } catch (e) {
    // OpenRouter not configured / model error — degrade silently.
    captureError(e, { route: "POST /api/recommend-competitors", userId: user.id });
    return json({ competitors: [] });
  }
}
