import type { IconName } from "@/components/icons/registry";

/* Shared types for the onboarding flow.
   Real enrichment is performed by POST /api/enrich (see lib/enrichment.ts);
   this file only declares the shapes used by the UI cards. */

export interface Social {
  kind: string;
  icon: IconName;
  value: string;
  on: boolean;
}

export interface CompanyData {
  name: string;
  domain: string;
  tagline: string;
  color: string;
  initials: string;
  socials: Social[];
}

/** Strip protocol + www + path → bare domain. Used for inputs like
    "https://www.example.com/about" → "example.com". */
export function domainFrom(url: string): string {
  let u = (url || "").trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\s+/g, "");
  return u;
}
