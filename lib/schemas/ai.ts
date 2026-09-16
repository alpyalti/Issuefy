import { z } from "zod";

/**
 * Zod schemas for OpenRouter JSON responses (PRD §16).
 * Used to validate AI output before anything enters the database.
 * Malformed output is rejected + logged, never stored (PRD §10.9 / §13.5).
 */

// 9 categories. Original 8 per PRD §13.5; "Industry Event" was added later
// to let the AI surface conferences, summits, webinars, and networking events
// found in the same scraped articles (kept in sync with the CHECK constraint
// in migrations/0007_industry_events.sql).
export const SIGNAL_CATEGORIES = [
  "Competitor Move",
  "Customer Pain Point",
  "Market Opportunity",
  "Threat / Risk",
  "Trend Signal",
  "Regulation / Policy",
  "Pricing / Offer Change",
  "Service Demand Signal",
  "Industry Event",
] as const;

export const IMPORTANCE = ["Low", "Medium", "High"] as const;

export const signalEvidenceSchema = z.object({
  kind: z.enum(["dated_event", "scheduled_event", "material_change"]),
  subject: z.string().trim().min(2).max(100),
  attribute: z.enum(["product_launch", "partnership", "pricing", "policy", "funding", "leadership", "availability", "capability", "industry_event"]),
  action_relation: z.enum(["compete", "review", "none"]),
  action_target: z.string().max(100).nullable(),
  quote: z.string().trim().min(20).max(700),
  event_date: z.string().nullable(),
  date_text: z.string().nullable(),
  before_quote: z.string().max(700).nullable(),
  before_value: z.string().max(80).nullable(),
  after_value: z.string().max(80).nullable(),
}).strict();

/** Per-signal payload returned by the model (PRD §16.1). */
export const signalItemSchema = z.object({
  source_id: z.string().min(1, "source_id is required"),
  evidence: signalEvidenceSchema,
  title: z.string().trim().min(3).max(200),
  category: z.enum(SIGNAL_CATEGORIES),
  description: z.string().trim().min(1).max(1_000),
  importance: z.enum(IMPORTANCE),
  confidence_score: z.number().int().min(0).max(100),
  suggested_action: z.string().trim().max(400).optional().default(""),
}).strict();

export const signalExtractionResponseSchema = z.object({
  signals: z.array(signalItemSchema).max(50),
}).strict();

export type SignalItem = z.infer<typeof signalItemSchema>;
export type SignalExtractionResponse = z.infer<typeof signalExtractionResponseSchema>;

/** Daily summary payload (PRD §16.2). */
export const dailySummaryResponseSchema = z.object({
  summary_text: z.string().trim().min(1).max(2_000),
  source_ids: z.array(z.string().min(1)).max(20),
}).strict();

export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;
