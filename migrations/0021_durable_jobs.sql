-- Existing rows/history are retained. Legacy daily rows have no dedup key.
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS daily_key date;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'queued';
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS dispatch_error text;
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_status_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed'));
CREATE UNIQUE INDEX IF NOT EXISTS scrape_jobs_daily_key
  ON scrape_jobs(project_id, daily_key) WHERE daily_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS scrape_jobs_pending ON scrape_jobs(created_at) WHERE status = 'pending';
