-- PRD §14.12 indexes.
-- Unique constraints on sources, daily_summaries, and usage_counters already
-- create their own indexes; those are NOT duplicated here.

CREATE INDEX IF NOT EXISTS idx_sources_project           ON sources (project_id);
CREATE INDEX IF NOT EXISTS idx_sources_project_scraped   ON sources (project_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_signals_project_created   ON signals (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_project_dismissed ON signals (project_id) WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_competitors_project       ON competitors (project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_project          ON keywords (project_id);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_project_created ON scrape_jobs (project_id, created_at DESC);
