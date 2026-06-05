import type { IconName } from "@/components/icons/registry";

/* Website → profile enrichment (simulated). Ported from design-reference/modals.jsx.
   Phase 3 replaces enrichFromWebsite() with a fetch to POST /api/enrich. */

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

export function domainFrom(url: string): string {
  let u = (url || "").trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\s+/g, "");
  return u;
}
function titleCase(s: string): string {
  return s.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function nameFromDomain(d: string): string {
  const base = d.split(".")[0] || d;
  return titleCase(base);
}

const KNOWN: Record<string, { name: string; tagline: string; color: string }> = {
  "tasklane.com": { name: "Tasklane", tagline: "Flat-rate project management for teams", color: "#2D5BE3" },
  "northwind.io": { name: "Northwind", tagline: "Usage-based work platform", color: "#168F6B" },
  "vega.com": { name: "Vega", tagline: "Project tools for mid-market", color: "#7C3AED" },
  "cadence.app": { name: "Cadence", tagline: "Workflow automation in Slack", color: "#DA552F" },
};

const SOCIAL_DEFS: { kind: string; icon: IconName; fmt: (d: string, h: string) => string }[] = [
  { kind: "Website", icon: "Globe02Icon", fmt: (d) => d },
  { kind: "X", icon: "NewTwitterIcon", fmt: (_d, h) => "@" + h },
  { kind: "LinkedIn", icon: "Linkedin01Icon", fmt: (_d, h) => "/company/" + h },
  { kind: "Instagram", icon: "InstagramIcon", fmt: (_d, h) => "@" + h },
];

export function enrichFromWebsite(url: string): CompanyData {
  const d = domainFrom(url);
  const known = KNOWN[d];
  const name = known ? known.name : nameFromDomain(d);
  const handle = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const defs = known ? SOCIAL_DEFS : SOCIAL_DEFS.slice(0, 3);
  return {
    name,
    domain: d,
    tagline: known ? known.tagline : "",
    color: known ? known.color : "#15171A",
    initials,
    socials: defs.map((s) => ({ kind: s.kind, icon: s.icon, value: s.fmt(d, handle), on: true })),
  };
}
