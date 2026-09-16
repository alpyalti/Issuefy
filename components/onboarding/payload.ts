import { trackedWebsite } from "@/lib/tracked-website";
import type { CompanyData, Social } from "./enrich";

/** The entered URL is the monitoring target; the card domain is display-only. */
export function seedWebsite(socials: Social[], enteredUrl: string): Social[] {
  if (!enteredUrl.trim()) return socials;
  return [
    { kind: "Website", icon: "Globe02Icon", value: enteredUrl.trim(), on: true },
    ...socials.filter((s) => s.kind.toLowerCase() !== "website"),
  ];
}

function websiteValue(card: CompanyData): string | undefined {
  const website = card.socials.find((s) => s.kind.toLowerCase() === "website");
  if (!website?.value.trim()) return undefined;
  return trackedWebsite(website.value);
}

function cardToSocialsPayload(card: CompanyData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of card.socials) {
    if (!s.on || !s.value) continue;
    const k = s.kind.toLowerCase();
    out[k === "twitter" ? "x" : k] = k === "website" ? websiteValue(card)! : s.value;
  }
  return out;
}

export function competitorPayload(card: CompanyData) {
  const website = card.socials.find((s) => s.kind.toLowerCase() === "website");
  if (!website?.on || !website.value.trim()) {
    throw new Error(`Website tracking is required for ${card.name}. Enter its website and enable tracking, or remove the competitor.`);
  }
  return {
    website_url: websiteValue(card)!, name: card.name, description: card.tagline,
    socials: cardToSocialsPayload(card),
  };
}

export function companyPayload(card: CompanyData) {
  const website = websiteValue(card);
  return {
    company_name: card.name,
    ...(website ? { company_website: website } : {}),
    company_description: card.tagline,
    company_socials: cardToSocialsPayload(card),
    track_company: !!website && !!card.socials.find((s) => s.kind.toLowerCase() === "website")?.on,
  };
}
