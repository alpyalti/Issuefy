/**
 * HTML → cleaned text, plus the <200-char content quality gate (PRD §13.3).
 *
 * Deliberately minimal: strip <script>/<style>/<svg>/<noscript>, drop tags,
 * collapse whitespace. No JS rendering and no DOM library — we run on Node
 * route handlers, and ScraperAPI's `render=true` already handles JS pages.
 */

const STRIP_BLOCKS = /<(script|style|svg|noscript|template|iframe)\b[\s\S]*?<\/\1\s*>/gi;
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;
const TAGS = /<\/?[^>]+>/g;
const WS = /\s+/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m] ?? m);
}

/**
 * Clean an HTML page to text. Returns `{ title, text }`. Both may be empty.
 */
export function cleanHtml(html: string): { title: string; text: string } {
  if (!html) return { title: "", text: "" };

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  const stripped = html
    .replace(STRIP_BLOCKS, " ")
    .replace(HTML_COMMENTS, " ")
    .replace(TAGS, " ");

  const text = decodeEntities(stripped).replace(WS, " ").trim();
  return { title, text };
}

/** PRD §13.3 — empty/blocked pages must be filtered out before store + AI. */
export const MIN_CLEANED_TEXT = 200;

export interface CleanResult {
  title: string;
  text: string;
  /** Truncated to `maxChars` for storage / AI prompts (PRD §10.8 — ~6,000). */
  snippet: string;
  /** True when the page passes the quality gate (≥ MIN_CLEANED_TEXT chars). */
  ok: boolean;
}

export function cleanForStorage(html: string, maxChars = 6_000): CleanResult {
  const { title, text } = cleanHtml(html);
  const snippet = text.slice(0, maxChars);
  return {
    title,
    text,
    snippet,
    ok: text.length >= MIN_CLEANED_TEXT,
  };
}
