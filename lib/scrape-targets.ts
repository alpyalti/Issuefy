import { normalizeUrl } from "./url-normalize";

interface Target {
  url: string;
  scrapeOpts?: { render?: boolean; premium?: boolean };
}

/** Match the identity used by source upsert. First target keeps attribution;
 * duplicate social targets can still require render/premium for that one fetch. */
export function dedupeScrapeTargets<T extends Target>(targets: T[]): T[] {
  const unique = new Map<string, T>();
  for (const target of targets) {
    // Invalid URLs remain distinct work errors; do not fail the whole batch.
    let key: string;
    try { key = normalizeUrl(target.url); } catch { key = target.url; }
    const prior = unique.get(key);
    if (!prior) unique.set(key, { ...target });
    else unique.set(key, { ...prior, scrapeOpts: {
      render: !!(prior.scrapeOpts?.render || target.scrapeOpts?.render),
      premium: !!(prior.scrapeOpts?.premium || target.scrapeOpts?.premium),
    } });
  }
  return [...unique.values()];
}
