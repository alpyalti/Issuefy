-- 0015 — missing indexes surfaced by the performance audit.
--
-- sources.keyword_id / sources.competitor_id: both FKs are filtered on every
-- keyword/competitor hub view (counts + signal joins) and walked by ON DELETE
-- cascades, but neither has an index — each lookup was a sequential scan of
-- the shared multi-tenant sources table.
CREATE INDEX IF NOT EXISTS idx_sources_keyword    ON sources (keyword_id)    WHERE keyword_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sources_competitor ON sources (competitor_id) WHERE competitor_id IS NOT NULL;

-- keyword_leads: the Conversations inbox orders by lead_score with only a
-- project filter; the existing (project_id, status, lead_score) index can't
-- serve that without the status column.
CREATE INDEX IF NOT EXISTS idx_keyword_leads_project_score ON keyword_leads (project_id, lead_score DESC);
