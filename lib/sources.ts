/**
 * Source storage + upsert dedup (PRD §13.4).
 *
 * `upsertSource(...)` does an INSERT ... ON CONFLICT (project_id, url) DO
 * UPDATE on `sources`, normalizing the URL first so trailing slashes,
 * tracking params, and casing variants merge into one row. Returns a flag
 * telling the caller whether a NEW row was created — used to decide whether
 * to increment the `sources_stored` usage counter.
 */
import { requireSql } from "./db";
import { domainOf, normalizeUrl } from "./url-normalize";

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

  // xmax = 0 (the row's MVCC delete-marker for the inserter) means a fresh
  // INSERT path; non-zero means we took the DO UPDATE path on an existing row.
  // This is the standard Postgres trick for "was this an insert?".
  const rows = (await sql`
    INSERT INTO sources (
      project_id, competitor_id, keyword_id, title, url, domain, source_type,
      scraped_at, content_snippet, cleaned_text, r2_raw_html_key
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
      ${input.r2RawHtmlKey ?? null}
    )
    ON CONFLICT (project_id, url) DO UPDATE SET
      title           = EXCLUDED.title,
      domain          = EXCLUDED.domain,
      source_type     = EXCLUDED.source_type,
      scraped_at      = EXCLUDED.scraped_at,
      content_snippet = EXCLUDED.content_snippet,
      cleaned_text    = EXCLUDED.cleaned_text,
      r2_raw_html_key = COALESCE(EXCLUDED.r2_raw_html_key, sources.r2_raw_html_key),
      competitor_id   = COALESCE(EXCLUDED.competitor_id, sources.competitor_id),
      keyword_id      = COALESCE(EXCLUDED.keyword_id, sources.keyword_id)
    RETURNING id, url, (xmax = 0) AS inserted
  `) as { id: string; url: string; inserted: boolean }[];

  return rows[0];
}
