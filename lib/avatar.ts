/**
 * Tiny helpers for visual identity of source publications.
 *
 *   colorFor(domain)    — stable hash → tasteful brand color from a fixed palette
 *   initialsOf(name)    — 2-letter chip code (techcrunch.com → "TC")
 *
 * Used by the dashboard, sources page, and (potentially) command-palette
 * Favicons. Stable hash means the same publication always shows the same
 * color across views, even though we don't pull the real favicon yet.
 */
const PALETTE = [
  "#2D5BE3", "#168F6B", "#FF6600", "#FF4500", "#E1523D",
  "#0A66C2", "#146AFF", "#7C3AED", "#DA552F", "#0CAA41",
];

export function colorFor(domain: string): string {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function initialsOf(s: string): string {
  if (!s) return "?";
  // Strip TLD ("techcrunch.com" → "techcrunch"), then split on common separators.
  const parts = s.replace(/\.[a-z]+$/i, "").split(/[\s.-]/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || s[0]).toUpperCase();
}
