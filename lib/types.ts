import type { IconName } from "@/components/icons/registry";

/* Shared UI types. During Phase 1 these back the mock dashboard; later phases
   map real DB rows (signals, sources, summaries) onto the same shapes so the
   ported components stay unchanged. */

export type SignalCategory = "competitor" | "opportunity" | "threat" | "signal";
export type Severity = "high" | "med" | "low";

export interface SourceItem {
  key?: string;
  name: string;
  kind: string;
  color: string;
  initials: string;
  headline: string;
  time: string;
  url: string;
}

export interface SignalItem {
  id: string;
  category: SignalCategory;
  severity: Severity;
  isNew: boolean;
  saved: boolean;
  hoursAgo: number;
  title: string;
  context: string;
  tags: string[];
  sources: SourceItem[];
}

export interface StatItem {
  label: string;
  value: string;
  icon: IconName;
  delta: string;
  tone: "mute" | "info" | "pos" | "neg";
}

export interface WatchItem {
  label: string;
  type: "Competitor" | "Keyword";
  live: boolean;
}

export interface DailySummary {
  count: number;
  lead: string;
  body: string;
  moves: string[];
}

export interface MyCompany {
  name: string;
  domain: string;
  color?: string;
  initials: string;
}

export interface DashboardData {
  user: { name: string; role: string; company: string; initials: string };
  today: string;
  generatedAt: string;
  summary: DailySummary;
  stats: StatItem[];
  signals: SignalItem[];
  recentSources: (SourceItem & { sigCat?: SignalCategory })[];
  watchlist: WatchItem[];
}

/* Category + severity display metadata (ported from components.jsx CAT/SEV). */
export const CAT: Record<
  SignalCategory,
  { label: string; pill: string; dotIcon: IconName; tone: string }
> = {
  competitor: { label: "Competitor", pill: "pill-info", dotIcon: "Target01Icon", tone: "info" },
  opportunity: { label: "Opportunity", pill: "pill-pos", dotIcon: "BulbIcon", tone: "pos" },
  threat: { label: "Risk", pill: "pill-neg", dotIcon: "Alert02Icon", tone: "neg" },
  signal: { label: "Market", pill: "", dotIcon: "ChartIncreaseIcon", tone: "mute" },
};

export const SEV: Record<Severity, { label: string; cls: string }> = {
  high: { label: "High signal", cls: "sev-high" },
  med: { label: "Worth a look", cls: "sev-med" },
  low: { label: "FYI", cls: "sev-low" },
};

export function fmtAge(h: number | null | undefined): string {
  if (h == null) return "";
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  const d = Math.round(h / 24);
  return d + "d ago";
}
