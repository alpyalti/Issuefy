/**
 * The one canonical "Your company (…)" prompt block. Both the signal
 * classifier (lib/signals.ts) and the daily-brief writer (lib/daily-summary.ts)
 * previously inlined byte-identical copies — a company-profile field change
 * had to be made twice or the prompts drifted. The no-profile fallback wording
 * intentionally differs per prompt, so it's a parameter.
 */
export interface CompanyBlockFields {
  track_company: boolean | null;
  company_name: string | null;
  company_website: string | null;
  company_description: string | null;
}

export function companyPromptBlock(p: CompanyBlockFields, emptyFallback: string): string {
  return p.track_company || p.company_name
    ? `Your company (${p.company_name || "unnamed"}, ${p.company_website || "no website"}): ${p.company_description || "(no description)"}`
    : emptyFallback;
}
