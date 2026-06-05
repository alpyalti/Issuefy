import { z } from "zod";

/* Zod schemas for API request bodies. Strict — reject unknown fields. */

const url = z.string().trim().min(3).max(2_048).refine((v) => {
  // Accept bare domains too — we'll normalize to https://… in the enrichment
  // layer (PRD §13.11). What we reject is whitespace-only or obviously garbage.
  return /^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(v) || /^https?:\/\//i.test(v);
}, { message: "Must be a website URL" });

const socials = z.object({
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  linkedin: z.string().optional(),
  x: z.string().optional(),
  twitter: z.string().optional(),
  youtube: z.string().optional(),
  tiktok: z.string().optional(),
  website: z.string().optional(),
}).strict().partial();

export const BUSINESS_TYPES = [
  "Logistics / Transportation",
  "B2B Services",
  "Agency",
  "SaaS",
  "Consumer Brand",
  "E-commerce",
  "Other",
] as const;

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  industry: z.string().trim().min(1).max(120),
  business_type: z.enum(BUSINESS_TYPES),
  target_market: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).optional(),
  // Optional company profile (PRD §12.2, §13.11): present when the user did NOT
  // skip "Your company".
  company_name: z.string().trim().max(120).optional(),
  company_website: url.optional(),
  company_description: z.string().trim().max(600).optional(),
  company_logo_url: z.string().trim().max(2_048).url().optional(),
  company_socials: socials.optional(),
  track_company: z.boolean().optional().default(false),
}).strict();

export const projectUpdateSchema = projectCreateSchema.partial();

export const competitorCreateSchema = z.object({
  website_url: url,
  // Confirmed enriched fields, sent from the confirm screen (PRD §15.2)
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(600).optional(),
  logo_url: z.string().trim().max(2_048).url().optional(),
  socials: socials.optional(),
  notes: z.string().trim().max(600).optional(),
}).strict();

export const competitorUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  website_url: url.optional(),
  description: z.string().trim().max(600).optional(),
  logo_url: z.string().trim().max(2_048).url().optional(),
  socials: socials.optional(),
  notes: z.string().trim().max(600).optional(),
  is_active: z.boolean().optional(),
}).strict();

export const keywordCreateSchema = z.object({
  keyword: z.string().trim().min(1).max(120),
}).strict();

export const keywordUpdateSchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
}).strict();

export const enrichRequestSchema = z.object({
  url,
}).strict();

export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
export type CompetitorCreate = z.infer<typeof competitorCreateSchema>;
export type CompetitorUpdate = z.infer<typeof competitorUpdateSchema>;
export type KeywordCreate = z.infer<typeof keywordCreateSchema>;
export type KeywordUpdate = z.infer<typeof keywordUpdateSchema>;
