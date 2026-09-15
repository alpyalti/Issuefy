import { z } from "zod";
import { withTx } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getLimits, HARD_CAPS } from "@/lib/usage";
import { projectCreateSchema, competitorCreateSchema, keywordCreateSchema } from "@/lib/schemas/api";

export const projectSetupSchema = projectCreateSchema.extend({
  setup: z.object({
    competitors: z.array(competitorCreateSchema).max(HARD_CAPS.competitorsPerProject),
    keywords: z.array(keywordCreateSchema).max(HARD_CAPS.keywordsPerProject),
  }).strict().refine((s) => s.competitors.length >= 1 || s.keywords.length >= 3, {
    message: "Add at least one competitor or three keywords.",
  }).optional(),
});

export class SetupError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Owner row serializes project quota decisions; every setup write rolls back together. */
export async function createProjectSetup(userId: string, body: z.infer<typeof projectSetupSchema>) {
  return withTx(async (client) => {
    const { rows: owners } = await client.query(
      "SELECT plan, role, subscription_status FROM users WHERE id = $1 FOR UPDATE", [userId],
    );
    const owner = owners[0];
    if (!owner) throw new SetupError("Account unavailable", 401);
    if (stripe && owner.role !== "admin" && !["active", "trialing", "past_due", "paused"].includes(owner.subscription_status)) {
      throw new SetupError("Subscription required. Open /upgrade to continue.", 402);
    }
    const limits = getLimits(owner.plan);
    const { rows: counts } = await client.query("SELECT COUNT(*)::int AS n FROM projects WHERE user_id = $1", [userId]);
    if (counts[0].n >= limits.projects) throw new SetupError(`Your plan allows ${limits.projects} projects. Upgrade for more.`, 409);
    const competitors = body.setup?.competitors ?? [];
    const keywords = body.setup?.keywords ?? [];
    if (competitors.length > Math.min(limits.competitorsPerProject, HARD_CAPS.competitorsPerProject) ||
        keywords.length > Math.min(limits.keywordsPerProject, HARD_CAPS.keywordsPerProject)) {
      throw new SetupError("Your watchlist exceeds your plan limits. Remove items and try again.", 409);
    }
    const { rows } = await client.query(`INSERT INTO projects (
      user_id, name, company_name, company_website, company_description, company_logo_url,
      company_socials, track_company, industry, business_type, target_market, description
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [
      userId, body.name, body.company_name ?? null, body.company_website ?? null,
      body.company_description ?? null, body.company_logo_url ?? null,
      body.company_socials ? JSON.stringify(body.company_socials) : null, body.track_company ?? false,
      body.industry, body.business_type, body.target_market, body.description ?? null,
    ]);
    const project = rows[0] as { id: string };
    await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'owner')", [project.id, userId]);
    for (const c of competitors) {
      await client.query(`INSERT INTO competitors
        (project_id, name, website_url, description, logo_url, socials, notes, enrichment_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [project.id,
        c.name || c.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0],
        c.website_url, c.description ?? null, c.logo_url ?? null,
        c.socials ? JSON.stringify(c.socials) : null, c.notes ?? null,
        c.name || c.description || c.logo_url || c.socials ? "manual" : null,
      ]);
    }
    for (const k of keywords) {
      await client.query("INSERT INTO keywords (project_id, keyword) VALUES ($1,$2)", [project.id, k.keyword]);
    }
    return project;
  });
}
