-- 0008 — Competitor / source page change detection.
--
-- Adds the three columns the scraper needs to notice when a URL we've seen
-- before came back with materially different content this cycle:
--
--   content_hash        SHA-256 of cleaned_text from the latest scrape.
--                       Lets us detect "did anything change" in O(1).
--   prior_cleaned_text  The previous cleaned text — written ONLY when the
--                       hash changes. Carried for one cycle so the AI can
--                       see what the page looked like before the change.
--   last_changed_at     Stamped when the hash changes vs the previously
--                       stored hash. NULL until at least one change is seen.
--                       NEVER stamped on the very first scrape (no prior to
--                       compare against).
--
-- This is additive; no existing data needs to be migrated. First scrape
-- after deploy populates content_hash; the second+ scrape can detect change.

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS content_hash       text,
  ADD COLUMN IF NOT EXISTS prior_cleaned_text text,
  ADD COLUMN IF NOT EXISTS last_changed_at    timestamptz;

-- Helps the signals batch query "find sources that changed in this cycle".
CREATE INDEX IF NOT EXISTS idx_sources_last_changed_at
  ON sources (last_changed_at DESC NULLS LAST);
