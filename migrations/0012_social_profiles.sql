-- 0012 — Competitor Hub: social profile tracking (Apify Instagram + stats tier).
--
-- Four tables:
--   social_profiles           one row per (competitor, platform-with-link);
--                             latest fetch denormalized for fast hub render
--   social_profile_snapshots  one per profile per day → clean graph series
--   social_posts              IG posts, upserted by shortcode so re-fetches
--                             refresh engagement counts
--   social_insights           one current AI insight per competitor (upsert)
--
-- Signals created from social deltas go through the EXISTING sources +
-- signal_sources path (a source row is upserted for the profile URL), so no
-- new FK from signals is needed here.

CREATE TABLE IF NOT EXISTS social_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN
                    ('instagram','youtube','reddit','linkedin','tiktok','facebook')),
  handle          text NOT NULL,            -- parsed from competitors.socials URL
  url             text NOT NULL,
  full_name       text,
  biography       text,
  profile_pic_url text,                     -- IG CDN URL, refreshed daily (signed/expiring)
  is_verified     boolean,
  followers       integer,                  -- subscribers (YT) / members (Reddit)
  following       integer,
  posts_count     integer,
  external_url    text,
  last_fetched_at timestamptz,
  fetch_status    text NOT NULL DEFAULT 'pending'
                    CHECK (fetch_status IN ('pending','ok','failed','link_only')),
  fetch_error     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competitor_id, platform)
);

CREATE TABLE IF NOT EXISTS social_profile_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  captured_on     date NOT NULL DEFAULT CURRENT_DATE,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  followers       integer,
  following       integer,
  posts_count     integer,
  avg_likes       numeric,                  -- mean over latest posts at capture (IG)
  avg_comments    numeric,
  engagement_rate numeric,                  -- (avg_likes + avg_comments) / followers * 100
  UNIQUE (profile_id, captured_on)
);
CREATE INDEX IF NOT EXISTS idx_social_snapshots_profile_date
  ON social_profile_snapshots (profile_id, captured_on DESC);

CREATE TABLE IF NOT EXISTS social_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  platform_post_id text NOT NULL,           -- IG shortcode
  url              text NOT NULL,
  post_type        text,                    -- Image | Video | Sidecar
  caption          text,
  display_url      text,                    -- CDN thumbnail (expiring; UI has onError fallback)
  likes            integer,
  comments         integer,
  video_views      integer,
  posted_at        timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  raw              jsonb,                   -- full Apify item — schema-drift insurance
  UNIQUE (profile_id, platform_post_id)
);
CREATE INDEX IF NOT EXISTS idx_social_posts_profile_posted
  ON social_posts (profile_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS social_insights (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL UNIQUE REFERENCES competitors(id) ON DELETE CASCADE,
  insight_text  text NOT NULL,              -- 80–140 word editorial paragraph
  highlights    jsonb,                      -- [{label, detail}] 3–5 bullets
  model_used    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- New per-cycle counter column for Apify profile fetches (usage_counters is
-- column-per-counter by design — see lib/usage-counters.ts).
ALTER TABLE usage_counters
  ADD COLUMN IF NOT EXISTS social_fetches integer NOT NULL DEFAULT 0;
