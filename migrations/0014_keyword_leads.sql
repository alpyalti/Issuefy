-- 0014 — Lead discovery: potential customers found on Reddit / Hacker News.
--
-- The lead engine searches each active keyword on Reddit + HN, classifies
-- whether the post author is a plausible customer for the user's brand, and
-- stores the qualifying posts here. Reply drafts are generated on demand
-- (draft_reply stays NULL until the user clicks "Draft reply").
CREATE TABLE IF NOT EXISTS keyword_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  keyword_id    uuid NOT NULL REFERENCES keywords(id)  ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('reddit','hackernews')),
  post_url      text NOT NULL,
  post_title    text,
  post_excerpt  text,                -- first ~500 chars of body
  author        text,
  author_url    text,                -- reddit user / HN user page
  context       text,                -- subreddit ("r/SaaS") or "Hacker News"
  posted_at     timestamptz,
  engagement    integer,             -- reddit score / HN points
  lead_score    integer NOT NULL,    -- 0-100 classifier confidence
  intent        text,                -- seeking_recommendation | frustrated_with_tool | asking_how_to | comparing_options | researching
  reason        text,                -- one-line why this is a lead
  draft_reply   text,                -- NULL until the user requests one
  draft_model   text,
  status        text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','saved','dismissed','replied')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword_id, post_url)      -- a post is a lead once per keyword
);
CREATE INDEX IF NOT EXISTS idx_keyword_leads_project ON keyword_leads (project_id, status, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_leads_keyword ON keyword_leads (keyword_id, created_at DESC);

-- Per-cycle budget for lead classifications (one unit per candidate post).
ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS lead_scans integer NOT NULL DEFAULT 0;
