import type { SignalItem } from "./schemas/ai";

export const EVENT_MAX_AGE_DAYS = 14;
export const CHANGE_WINDOW_MS = 60 * 60 * 1000;
export interface GroundingSource {
  source_id: string;
  text: string;
  text_before?: string;
  changed_since_last_scrape?: boolean;
}

const DAY = 86400000;
function sentences(text: string): string[] {
  return Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), (s) => s.segment.trim()).filter(Boolean);
}
function identity(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function containsIdentity(text: string, name: string): boolean {
  const n = identity(name);
  const words = Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text), (s) => identity(s.segment)).filter(Boolean).join(" ");
  return !!n && (` ${words} `).includes(` ${n} `);
}
function dateSupported(iso: string, literal: string, now: number, scheduled: boolean): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const time = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== iso) return false;
  const today = Math.floor(now / DAY) * DAY;
  if (scheduled ? time < today : time > today || today - time > EVENT_MAX_AGE_DAYS * DAY) return false;
  const d = new Date(time);
  const day = d.getUTCDate(), month = d.getUTCMonth() + 1, year = d.getUTCFullYear();
  const forms = [iso, `${day}.${month}.${year}`, `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`, `${year}年${month}月${day}日`];
  // Exact locale renderings are unambiguous; never parse ambiguous slash dates
  // or infer a year from the current scrape. Date text must also be in the quote.
  for (const locale of ["en-US", "en-GB", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR", "tr-TR", "ar", "ja-JP", "zh-CN"]) {
    forms.push(new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(d));
  }
  const normalized = (v: string) => v.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return forms.some((f) => normalized(f) === normalized(literal));
}

/** Returns an extractive publication payload, or null. Exact spans and dates are
 * necessary evidence checks, not a proof of semantic truth or source credibility.
 * Subject/attribute relevance and event meaning remain model judgments. */
export function groundSignal(
  signal: SignalItem, source: GroundingSource | undefined,
  company: { company_name: string | null; company_website: string | null }, now: number,
): SignalItem | null {
  if (!source || source.source_id !== signal.source_id) return null;
  const e = signal.evidence;
  const after = sentences(source.text);
  const index = after.indexOf(e.quote);
  // Require a complete source sentence, not a cherry-picked fragment that can
  // discard negation or billing conditions. Reject truncated sentence endings.
  if (index < 0 || !/[.!?。！？]["')\]]?$/.test(e.quote) || !containsIdentity(e.quote, e.subject)) return null;
  let ownHost = "";
  if (company.company_website) {
    try { ownHost = new URL(company.company_website.startsWith("http") ? company.company_website : `https://${company.company_website}`).hostname.replace(/^www\./, ""); } catch { /* no valid profile URL */ }
  }
  // Display profiles may annotate a brand (e.g. "Linear — Issuefy Demo").
  // Keep both the full identity and the standalone leading display-name part.
  // Do not split ordinary hyphenated brand names or guess aliases from prose.
  const companyNames = company.company_name ? [company.company_name, company.company_name.split(/\s+[—–]\s+/)[0]] : [];
  const isOwn = (name: string) => companyNames.some((n) => containsIdentity(name, n)) ||
    !!(ownHost && containsIdentity(name, ownHost));
  if (signal.category === "Competitor Move" && isOwn(e.subject)) return null;
  // Only suppress a recommendation explicitly targeting self as competition.
  const selfCompeting = e.action_relation === "compete" &&
    (isOwn(e.action_target || "") || isOwn(signal.suggested_action));

  let title: string;
  let description: string;
  if (e.kind === "dated_event" || e.kind === "scheduled_event") {
    const scheduled = e.kind === "scheduled_event";
    if (scheduled && signal.category !== "Industry Event") return null;
    if (!e.event_date || !e.date_text || e.before_quote !== null || e.before_value !== null || e.after_value !== null) return null;
    if (!dateSupported(e.event_date, e.date_text, now, scheduled) || !e.quote.includes(e.date_text)) return null;
    // A date elsewhere in a page (or scrape metadata) cannot anchor this claim.
    // The model must identify a complete event statement, not a page-update label.
    if (!e.quote.includes(signal.title)) return null;
    title = signal.title;
    description = e.quote;
  } else {
    if (e.event_date !== null || e.date_text !== null ||
        !source.changed_since_last_scrape || !source.text_before || !e.before_quote ||
        !sentences(source.text_before).includes(e.before_quote) || !containsIdentity(e.before_quote, e.subject) ||
        source.text.includes(e.before_quote) || source.text_before.includes(e.quote)) return null;
    const beforeValue = e.before_value?.trim(), afterValue = e.after_value?.trim();
    if (!beforeValue || !afterValue || identity(beforeValue) === identity(afterValue) ||
        !e.before_quote.includes(beforeValue) || !e.quote.includes(afterValue)) return null;
    // A single changed field with identical surrounding subject/terms is a
    // conservative structural check. It does not independently prove materiality.
    if (e.before_quote.replace(beforeValue, "<VALUE>") !== e.quote.replace(afterValue, "<VALUE>")) return null;
    title = `${e.subject}: observed change`;
    description = `Previously: ${e.before_quote}\nNow: ${e.quote}`;
  }
  // Include the immediately following source sentence so adjacent billing terms
  // (e.g. "Billed annually.") are not lost when the evidence mentions a price.
  if (/\p{Sc}\s*\d/u.test(e.quote) && after[index + 1]) description += ` ${after[index + 1]}`;
  if (description.length > 1000 || title.length > 200) return null;
  return { ...signal, title, description, suggested_action: selfCompeting ? "" : signal.suggested_action, evidence: e };
}
