/**
 * Plan limits and budgets (PRD §21).
 *
 * IMPORTANT: during beta — i.e. before billing is wired — every account is
 * served Starter limits regardless of `users.plan`. Flipping to per-plan limits
 * after Stripe lands is a single flag flip (`BETA_STARTER_LIMITS=false`).
 */

export type PlanId = "starter" | "growth" | "agency" | "enterprise";

export interface PlanLimits {
  // Customer-facing caps (PRD §21.1)
  projects: number;
  competitorsPerProject: number;
  keywordsPerProject: number;
  sourcesPerMonth: number;
  signalsPerMonth: number;
  sourceHistoryDays: number;
  manualRefreshesPerDay: number;

  // Per-cycle API-call budgets — the real cost ceiling (PRD §21.3)
  serpCallsPerCycle: number;
  scrapeCallsPerCycle: number;

  // Per-project/day safety rail (PRD §21.3)
  maxSourcesPerProjectPerDay: number;
  maxSignalsPerProjectPerDay: number;
}

// Hard technical caps — also baked into the schema CHECKs at the application
// layer (no DB constraint, since PRD per-plan limits differ). These ceil the
// raw per-project values regardless of plan.
export const HARD_CAPS = {
  competitorsPerProject: 5,
  keywordsPerProject: 20,
} as const;

const PLANS: Record<PlanId, PlanLimits> = {
  starter: {
    projects: 1,
    competitorsPerProject: 3,
    keywordsPerProject: 15,
    sourcesPerMonth: 300,
    signalsPerMonth: 100,
    sourceHistoryDays: 30,
    manualRefreshesPerDay: 1,
    serpCallsPerCycle: 80,
    scrapeCallsPerCycle: 1_200,
    maxSourcesPerProjectPerDay: 50,
    maxSignalsPerProjectPerDay: 20,
  },
  growth: {
    projects: 3,
    competitorsPerProject: 5,
    keywordsPerProject: 20,
    sourcesPerMonth: 1_500,
    signalsPerMonth: 500,
    sourceHistoryDays: 90,
    manualRefreshesPerDay: 3,
    serpCallsPerCycle: 250,
    scrapeCallsPerCycle: 4_000,
    maxSourcesPerProjectPerDay: 50,
    maxSignalsPerProjectPerDay: 20,
  },
  agency: {
    projects: 10,
    competitorsPerProject: 5,
    keywordsPerProject: 20,
    sourcesPerMonth: 6_000,
    signalsPerMonth: 2_000,
    sourceHistoryDays: 180,
    manualRefreshesPerDay: 10,
    serpCallsPerCycle: 700,
    scrapeCallsPerCycle: 12_000,
    maxSourcesPerProjectPerDay: 50,
    maxSignalsPerProjectPerDay: 20,
  },
  enterprise: {
    projects: 9_999,
    competitorsPerProject: 5,
    keywordsPerProject: 20,
    sourcesPerMonth: 60_000,
    signalsPerMonth: 20_000,
    sourceHistoryDays: 365,
    manualRefreshesPerDay: 100,
    serpCallsPerCycle: 7_000,
    scrapeCallsPerCycle: 120_000,
    maxSourcesPerProjectPerDay: 50,
    maxSignalsPerProjectPerDay: 20,
  },
};

const isBetaStarterMode = () => process.env.BETA_STARTER_LIMITS !== "false";

/**
 * Look up the limits for a user. During beta this always returns Starter so
 * we don't accidentally overspend before billing is wired.
 */
export function getLimits(plan: string | null | undefined): PlanLimits {
  if (isBetaStarterMode()) return PLANS.starter;
  const key = (plan ?? "starter") as PlanId;
  return PLANS[key] ?? PLANS.starter;
}

/** Period start = first day of the current calendar month, UTC. */
export function currentPeriodStart(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
