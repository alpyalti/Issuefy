-- 0013 — Mark Instagram posts as analyzed for signal extraction.
--
-- The social worker feeds each fetched IG post's caption + engagement to the
-- LLM ONCE to extract business-relevant signals (launches, pricing, events,
-- partnerships…). analyzed_at stamps when that happened so re-runs never
-- re-analyze the same post — each post costs exactly one LLM consideration,
-- keeping token spend bounded. New posts (default NULL) are picked up on the
-- next run.
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Partial index: the worker queries "unanalyzed posts for this profile" every
-- run; this keeps that lookup cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_social_posts_unanalyzed
  ON social_posts (profile_id) WHERE analyzed_at IS NULL;
