/**
 * Source storage + upsert dedup (PRD §13.4).
 *
 * `upsertSource(...)` does an INSERT ... ON CONFLICT (project_id, url) DO
 * UPDATE on `sources`, normalizing the URL first so trailing slashes,
 * tracking params, and casing variants merge into one row. Returns a flag
 * telling the caller whether a NEW row was created — used to decide whether
 * to increment the `sources_stored` usage counter.
 *
 * Change detection (migration 0008): each upsert hashes the new cleaned_text
 * and, on UPDATE, compares it against the stored content_hash. When they
 * differ AND the row had a prior hash (i.e. it's not the first-ever scrape
 * for that URL), the previous cleaned_text is promoted to prior_cleaned_text
 * and last_changed_at is stamped. The signals batch consumes those fields
 * to feed the AI a real before/after diff so it can emit a signal when a
 * competitor changes their landing page in a meaningful way.
 */
import { createHash } from "node:crypto";
import { requireSql } from "./db";
import { domainOf, normalizeUrl } from "./url-normalize";

function hashContent(text: string | null | undefined): string | null {
  if (!text) return null;
  return createHash("sha256").update(text).digest("hex");
}

export type SourceType =
  | "Competitor Website"
  | "Company Website"
  | "News"
  | "Article"
  | "Review"
  | "Public Discussion"
  | "Industry Page"
  | "Other";

export interface UpsertSourceInput {
  projectId: string;
  competitorId?: string | null;
  keywordId?: string | null;
  title: string;
  url: string;
  sourceType: SourceType;
  scrapedAt?: Date;
  contentSnippet?: string | null;
  cleanedText?: string | null;
  r2RawHtmlKey?: string | null;
}

export interface UpsertSourceResult {
  id: string;
  url: string;
  inserted: boolean;
}

export async function upsertSource(input: UpsertSourceInput): Promise<UpsertSourceResult> {
  const sql = requireSql();
  const url = normalizeUrl(input.url);
  const domain = domainOf(url);
  const scrapedAt = (input.scrapedAt ?? new Date()).toISOString();
  // Hash of the NEW cleaned text. Compared against sources.content_hash inside
  // the ON CONFLICT clause to decide whether to flag the row as changed.
  const newHash = hashContent(input.cleanedText);

  // xmax = 0 (the row's MVCC delete-marker for the inserter) means a fresh
  // INSERT path; non-zero means we took the DO UPDATE path on an existing row.
  // This is the standard Postgres trick for "was this an insert?".
  //
  // prior_cleaned_text + last_changed_at semantics (migration 0008):
  //   - First INSERT: content_hash = newHash; prior_cleaned_text = NULL;
  //     last_changed_at = NULL (nothing to compare against yet).
  //   - UPDATE with same hash: no change → keep prior_cleaned_text and
  //     last_changed_at as-is.
  //   - UPDATE with different hash AND the row had a prior hash: promote the
  //     OLD cleaned_text into prior_cleaned_text and stamp last_changed_at.
  //   - UPDATE with different hash but the row's OLD content_hash was NULL
  //     (legacy row from before this migration): treat as baseline — set the
  //     new hash, but don't flag as changed. The next scrape after this can
  //     start detecting changes.
  const rows = (await sql`
    INSERT INTO sources (
      project_id, competitor_id, keyword_id, title, url, domain, source_type,
      scraped_at, content_snippet, cleaned_text, r2_raw_html_key, content_hash
    ) VALUES (
      ${input.projectId},
      ${input.competitorId ?? null},
      ${input.keywordId ?? null},
      ${input.title},
      ${url},
      ${domain},
      ${input.sourceType},
      ${scrapedAt},
      ${input.contentSnippet ?? null},
      ${input.cleanedText ?? null},
      ${input.r2RawHtmlKey ?? null},
      ${newHash}
    )
    ON CONFLICT (project_id, url) DO UPDATE SET
      title           = EXCLUDED.title,
      domain          = EXCLUDED.domain,
      source_type     = EXCLUDED.source_type,
      scraped_at      = EXCLUDED.scraped_at,
      content_snippet = EXCLUDED.content_snippet,
      prior_cleaned_text = CASE
        WHEN EXCLUDED.content_hash IS DISTINCT FROM sources.content_hash
         AND sources.content_hash IS NOT NULL
         AND sources.cleaned_text IS NOT NULL
        THEN sources.cleaned_text
        ELSE sources.prior_cleaned_text
      END,
      cleaned_text    = EXCLUDED.cleaned_text,
      content_hash    = EXCLUDED.content_hash,
      last_changed_at = CASE
        WHEN EXCLUDED.content_hash IS DISTINCT FROM sources.content_hash
         AND sources.content_hash IS NOT NULL
        THEN now()
        ELSE sources.last_changed_at
      END,
      r2_raw_html_key = COALESCE(EXCLUDED.r2_raw_html_key, sources.r2_raw_html_key),
      competitor_id   = COALESCE(EXCLUDED.competitor_id, sources.competitor_id),
      keyword_id      = COALESCE(EXCLUDED.keyword_id, sources.keyword_id)
    RETURNING id, url, (xmax = 0) AS inserted
  `) as { id: string; url: string; inserted: boolean }[];

  return rows[0];
}
