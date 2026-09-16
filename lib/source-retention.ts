import { withTx } from "./db";

/** Retain lightweight citation stubs for as long as their intelligence exists. */
export async function expireSourceContent(): Promise<{ deleted: number; compacted: number }> {
  return withTx(async client => {
    // Expire analysis snapshots independently of the current source revision.
    // Completed rows retain their ledger identity; pending rows become explicitly
    // expired, so a slow/stale analyzer can no longer publish their results.
    await client.query(`WITH expired AS (
      SELECT v.id FROM source_analysis_versions v
      JOIN projects p ON p.id = v.project_id JOIN users u ON u.id = p.user_id
      WHERE v.captured_at < now() - CASE u.plan
        WHEN 'growth' THEN interval '90 days' WHEN 'agency' THEN interval '180 days'
        WHEN 'enterprise' THEN interval '365 days' ELSE interval '30 days' END
      AND (v.cleaned_text IS NOT NULL OR v.prior_cleaned_text IS NOT NULL OR v.result_signals IS NOT NULL)
      ORDER BY v.captured_at, v.id LIMIT 500 FOR UPDATE OF v SKIP LOCKED
    ) UPDATE source_analysis_versions v SET cleaned_text = NULL,
      prior_cleaned_text = NULL, result_signals = NULL, claim_token = NULL, lease_until = NULL,
      expired_at = COALESCE(v.expired_at, now()) FROM expired WHERE v.id = expired.id`);
    // Serialize against source refresh/attachment; bounded batches limit lock time.
    const expired = await client.query<{id: string}>(`
      SELECT s.id FROM sources s
      JOIN projects p ON p.id = s.project_id JOIN users u ON u.id = p.user_id
      WHERE s.scraped_at < now() - CASE u.plan
        WHEN 'growth' THEN interval '90 days' WHEN 'agency' THEN interval '180 days'
        WHEN 'enterprise' THEN interval '365 days' ELSE interval '30 days' END
      AND (s.cleaned_text IS NOT NULL OR s.prior_cleaned_text IS NOT NULL
        OR s.r2_raw_html_key IS NOT NULL
        OR (NOT EXISTS (SELECT 1 FROM signal_sources ss WHERE ss.source_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM daily_summary_sources ds WHERE ds.source_id = s.id)))
      ORDER BY s.scraped_at, s.id LIMIT 500 FOR UPDATE OF s SKIP LOCKED`);
    const ids = expired.rows.map(row => row.id);
    if (!ids.length) return { deleted: 0, compacted: 0 };
    const deleted = await client.query(`DELETE FROM sources s WHERE s.id = ANY($1::uuid[])
      AND NOT EXISTS (SELECT 1 FROM signal_sources ss WHERE ss.source_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM daily_summary_sources ds WHERE ds.source_id = s.id)
      RETURNING s.id`, [ids]);
    // Keep URL/title/domain/snippet/hash/dates. A future successful scrape can
    // rehydrate the content without changing the identity of any citation.
    const compacted = await client.query(`UPDATE sources SET cleaned_text = NULL,
      prior_cleaned_text = NULL, r2_raw_html_key = NULL WHERE id = ANY($1::uuid[])
      RETURNING id`, [ids]);
    return { deleted: deleted.rowCount ?? 0, compacted: compacted.rowCount ?? 0 };
  });
}
