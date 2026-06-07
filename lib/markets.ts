/**
 * Target-market registry — single source of truth for:
 *
 *   - the onboarding + settings dropdown UI
 *   - the API Zod enum that validates POST/PATCH bodies
 *   - the worker's geo-routed + multilingual SERP loop
 *   - the LLM prompts (canonical name passed to signals + daily summary)
 *
 * Each entry carries:
 *   - value           stable enum key (ALL_CAPS_SNAKE, never localized)
 *   - canonicalName   human-readable label
 *   - group           dropdown grouping (global | region | country)
 *   - countryCode     ScraperAPI country_code, or null for Global / regions
 *   - tld             Google TLD (no leading dot)
 *   - langs           ISO 639-1 list, ALWAYS starts with "en", length 1-3
 *
 * Language rule:
 *   - English-speaking countries → ["en"]
 *   - Global + continent/regions → ["en"] (too fragmented for a single lang)
 *   - Most non-English countries → ["en", "<dominant local>"]
 *   - Evenly-split multilingual countries (Belgium) → up to 3 langs
 *
 * Pure module — no DB, no fetch. Safe to import in any layer.
 */

export type MarketGroup = "global" | "region" | "country";

export interface MarketDescriptor {
  /** Stable dropdown value, ALL_CAPS_SNAKE — never changes, never localized. */
  value: string;
  /** Human-readable label shown in the dropdown + LLM prompts. */
  canonicalName: string;
  /** Dropdown grouping for <optgroup>. */
  group: MarketGroup;
  /** ScraperAPI country_code (ISO 3166-1 alpha-2, lowercase). null for
   *  Global / regions so the SERP defaults to a non-geo-pinned search. */
  countryCode: string | null;
  /** Google TLD (no leading dot). "com" for Global / regions. */
  tld: string;
  /** Language list. ALWAYS starts with "en". Length 1-3. */
  langs: string[];
  /** True iff this descriptor came from a real TARGET_MARKETS hit (vs. the
   *  DEFAULT_MARKET fallback the worker uses for legacy free-text values). */
  matched: boolean;
}

/** Used when target_market is empty, null, or a legacy free-text value the
 *  dropdown can't match. Worker keeps running on English-only signals. */
export const DEFAULT_MARKET: MarketDescriptor = {
  value: "GLOBAL",
  canonicalName: "Global",
  group: "global",
  countryCode: null,
  tld: "com",
  langs: ["en"],
  matched: false,
};

/** Curated registry. UI dropdown + worker import this. */
export const TARGET_MARKETS: MarketDescriptor[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  { value: "GLOBAL", canonicalName: "Global", group: "global",
    countryCode: null, tld: "com", langs: ["en"], matched: true },

  // ── Regions (single English call — too fragmented for a single lang) ────
  { value: "REGION_NORTH_AMERICA",  canonicalName: "North America",  group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_LATAM",          canonicalName: "Latin America",  group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_EUROPE",         canonicalName: "Europe",         group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_MENA",           canonicalName: "Middle East & North Africa", group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_AFRICA",         canonicalName: "Africa",         group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_ASIA",           canonicalName: "Asia",           group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_SOUTHEAST_ASIA", canonicalName: "Southeast Asia", group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },
  { value: "REGION_OCEANIA",        canonicalName: "Oceania",        group: "region",
    countryCode: null, tld: "com", langs: ["en"], matched: true },

  // ── Countries — English-first ──────────────────────────────────────────
  { value: "US", canonicalName: "United States",  group: "country",
    countryCode: "us", tld: "com",    langs: ["en"], matched: true },
  { value: "GB", canonicalName: "United Kingdom", group: "country",
    countryCode: "gb", tld: "co.uk",  langs: ["en"], matched: true },
  { value: "CA", canonicalName: "Canada",         group: "country",
    countryCode: "ca", tld: "ca",     langs: ["en"], matched: true },
  { value: "AU", canonicalName: "Australia",      group: "country",
    countryCode: "au", tld: "com.au", langs: ["en"], matched: true },
  { value: "NZ", canonicalName: "New Zealand",    group: "country",
    countryCode: "nz", tld: "co.nz",  langs: ["en"], matched: true },
  { value: "IE", canonicalName: "Ireland",        group: "country",
    countryCode: "ie", tld: "ie",     langs: ["en"], matched: true },
  { value: "IN", canonicalName: "India",          group: "country",
    countryCode: "in", tld: "co.in",  langs: ["en"], matched: true },
  { value: "SG", canonicalName: "Singapore",      group: "country",
    countryCode: "sg", tld: "com.sg", langs: ["en"], matched: true },
  { value: "PH", canonicalName: "Philippines",    group: "country",
    countryCode: "ph", tld: "com.ph", langs: ["en"], matched: true },
  { value: "ZA", canonicalName: "South Africa",   group: "country",
    countryCode: "za", tld: "co.za",  langs: ["en"], matched: true },

  // ── Countries — English + 1 dominant local language ────────────────────
  { value: "TR", canonicalName: "Turkey",       group: "country",
    countryCode: "tr", tld: "com.tr", langs: ["en", "tr"], matched: true },
  { value: "DE", canonicalName: "Germany",      group: "country",
    countryCode: "de", tld: "de",     langs: ["en", "de"], matched: true },
  { value: "AT", canonicalName: "Austria",      group: "country",
    countryCode: "at", tld: "at",     langs: ["en", "de"], matched: true },
  { value: "CH", canonicalName: "Switzerland",  group: "country",
    countryCode: "ch", tld: "ch",     langs: ["en", "de"], matched: true },
  { value: "FR", canonicalName: "France",       group: "country",
    countryCode: "fr", tld: "fr",     langs: ["en", "fr"], matched: true },
  { value: "ES", canonicalName: "Spain",        group: "country",
    countryCode: "es", tld: "es",     langs: ["en", "es"], matched: true },
  { value: "IT", canonicalName: "Italy",        group: "country",
    countryCode: "it", tld: "it",     langs: ["en", "it"], matched: true },
  { value: "NL", canonicalName: "Netherlands",  group: "country",
    countryCode: "nl", tld: "nl",     langs: ["en", "nl"], matched: true },
  { value: "PT", canonicalName: "Portugal",     group: "country",
    countryCode: "pt", tld: "pt",     langs: ["en", "pt"], matched: true },
  { value: "BR", canonicalName: "Brazil",       group: "country",
    countryCode: "br", tld: "com.br", langs: ["en", "pt"], matched: true },
  { value: "MX", canonicalName: "Mexico",       group: "country",
    countryCode: "mx", tld: "com.mx", langs: ["en", "es"], matched: true },
  { value: "AR", canonicalName: "Argentina",    group: "country",
    countryCode: "ar", tld: "com.ar", langs: ["en", "es"], matched: true },
  { value: "CO", canonicalName: "Colombia",     group: "country",
    countryCode: "co", tld: "com.co", langs: ["en", "es"], matched: true },
  { value: "CL", canonicalName: "Chile",        group: "country",
    countryCode: "cl", tld: "cl",     langs: ["en", "es"], matched: true },
  { value: "PE", canonicalName: "Peru",         group: "country",
    countryCode: "pe", tld: "com.pe", langs: ["en", "es"], matched: true },
  { value: "PL", canonicalName: "Poland",       group: "country",
    countryCode: "pl", tld: "pl",     langs: ["en", "pl"], matched: true },
  { value: "SE", canonicalName: "Sweden",       group: "country",
    countryCode: "se", tld: "se",     langs: ["en", "sv"], matched: true },
  { value: "NO", canonicalName: "Norway",       group: "country",
    countryCode: "no", tld: "no",     langs: ["en", "no"], matched: true },
  { value: "DK", canonicalName: "Denmark",      group: "country",
    countryCode: "dk", tld: "dk",     langs: ["en", "da"], matched: true },
  { value: "FI", canonicalName: "Finland",      group: "country",
    countryCode: "fi", tld: "fi",     langs: ["en", "fi"], matched: true },
  { value: "CZ", canonicalName: "Czech Republic", group: "country",
    countryCode: "cz", tld: "cz",     langs: ["en", "cs"], matched: true },
  { value: "GR", canonicalName: "Greece",       group: "country",
    countryCode: "gr", tld: "gr",     langs: ["en", "el"], matched: true },
  { value: "RO", canonicalName: "Romania",      group: "country",
    countryCode: "ro", tld: "ro",     langs: ["en", "ro"], matched: true },
  { value: "HU", canonicalName: "Hungary",      group: "country",
    countryCode: "hu", tld: "hu",     langs: ["en", "hu"], matched: true },
  { value: "UA", canonicalName: "Ukraine",      group: "country",
    countryCode: "ua", tld: "com.ua", langs: ["en", "uk"], matched: true },
  { value: "RU", canonicalName: "Russia",       group: "country",
    countryCode: "ru", tld: "ru",     langs: ["en", "ru"], matched: true },
  { value: "SA", canonicalName: "Saudi Arabia", group: "country",
    countryCode: "sa", tld: "com.sa", langs: ["en", "ar"], matched: true },
  { value: "AE", canonicalName: "United Arab Emirates", group: "country",
    countryCode: "ae", tld: "ae",     langs: ["en", "ar"], matched: true },
  { value: "EG", canonicalName: "Egypt",        group: "country",
    countryCode: "eg", tld: "com.eg", langs: ["en", "ar"], matched: true },
  { value: "IL", canonicalName: "Israel",       group: "country",
    countryCode: "il", tld: "co.il",  langs: ["en", "he"], matched: true },
  { value: "JP", canonicalName: "Japan",        group: "country",
    countryCode: "jp", tld: "co.jp",  langs: ["en", "ja"], matched: true },
  { value: "KR", canonicalName: "South Korea",  group: "country",
    countryCode: "kr", tld: "co.kr",  langs: ["en", "ko"], matched: true },
  { value: "CN", canonicalName: "China",        group: "country",
    countryCode: "cn", tld: "com.hk", langs: ["en", "zh"], matched: true },
  { value: "TW", canonicalName: "Taiwan",       group: "country",
    countryCode: "tw", tld: "com.tw", langs: ["en", "zh"], matched: true },
  { value: "HK", canonicalName: "Hong Kong",    group: "country",
    countryCode: "hk", tld: "com.hk", langs: ["en", "zh"], matched: true },
  { value: "TH", canonicalName: "Thailand",     group: "country",
    countryCode: "th", tld: "co.th",  langs: ["en", "th"], matched: true },
  { value: "VN", canonicalName: "Vietnam",      group: "country",
    countryCode: "vn", tld: "com.vn", langs: ["en", "vi"], matched: true },
  { value: "ID", canonicalName: "Indonesia",    group: "country",
    countryCode: "id", tld: "co.id",  langs: ["en", "id"], matched: true },
  { value: "MY", canonicalName: "Malaysia",     group: "country",
    countryCode: "my", tld: "com.my", langs: ["en", "ms"], matched: true },

  // ── Countries — English + 2 dominant local languages (max 3 total) ────
  // Belgium: Dutch (~59%) + French (~40%) split too evenly to pick one.
  { value: "BE", canonicalName: "Belgium",      group: "country",
    countryCode: "be", tld: "be",     langs: ["en", "nl", "fr"], matched: true },
];

/** O(1) lookup by value. */
const BY_VALUE = new Map<string, MarketDescriptor>(
  TARGET_MARKETS.map((m) => [m.value, m]),
);

/**
 * Lookup a market by its dropdown value. Unknown / null / legacy free-text
 * values fall back to DEFAULT_MARKET so pre-migration projects keep working.
 */
export function resolveMarket(value: string | null | undefined): MarketDescriptor {
  if (!value) return DEFAULT_MARKET;
  return BY_VALUE.get(value) ?? DEFAULT_MARKET;
}

/** True iff the saved value corresponds to a known dropdown entry. UI uses
 *  this to decide whether to show the "legacy" banner on settings. */
export function isKnownMarketValue(value: string | null | undefined): boolean {
  return !!value && BY_VALUE.has(value);
}

/** All non-English langs in this entry. Empty for English-only entries. */
export function nonEnglishLangs(m: MarketDescriptor): string[] {
  return m.langs.filter((l) => l !== "en");
}

/** All dropdown values, typed as a [string, ...string[]] for Zod enum. */
export const TARGET_MARKET_VALUES = TARGET_MARKETS.map((m) => m.value) as [
  string,
  ...string[],
];
