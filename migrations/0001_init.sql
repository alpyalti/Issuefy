-- Issuefy MVP schema (PRD §14). Plain SQL, no ORM.
-- Every FK to projects uses ON DELETE CASCADE so deleting a project drops
-- all of its child rows (PRD §23 retention rules).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 14.1 users — Clerk-synced via lazy upsert (PRD §10.4)
CREATE TABLE IF NOT EXISTS users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   text        NOT NULL UNIQUE,
  email           text        NOT NULL,
  name            text,
  company_name    text,
  plan            text        NOT NULL DEFAULT 'starter',
  trial_ends_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 14.2 projects — optional company profile (website-first enrichment per §13.11)
CREATE TABLE IF NOT EXISTS projects (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  company_name         text,
  company_website      text,
  company_description  text,
  company_logo_url     text,
  company_socials      jsonb,
  track_company        boolean     NOT NULL DEFAULT false,
  industry             text        NOT NULL,
  business_type        text        NOT NULL,
  target_market        text        NOT NULL,
  description          text,
  last_scraped_at      timestamptz,
  last_manual_refresh_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 14.3 competitors — added by URL only, enriched on the confirm screen
CREATE TABLE IF NOT EXISTS competitors (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  website_url        text        NOT NULL,
  description        text,
  logo_url           text,
  socials            jsonb,
  notes              text,
  enrichment_status  text        CHECK (enrichment_status IN ('enriched','failed','manual')),
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 14.4 keywords — last_discovered_at drives the WEEKLY SERP cadence (§10.7)
CREATE TABLE IF NOT EXISTS keywords (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword             text        NOT NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  last_discovered_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 14.5 scrape_jobs — per-project worker bookkeeping
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','running','completed','failed')),
  job_type        text        NOT NULL CHECK (job_type IN ('daily','manual')),
  started_at      timestamptz,
  finished_at     timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 14.6 sources — deduped per project on URL (§13.4)
CREATE TABLE IF NOT EXISTS sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  competitor_id     uuid        REFERENCES competitors(id) ON DELETE SET NULL,
  keyword_id        uuid        REFERENCES keywords(id) ON DELETE SET NULL,
  title             text        NOT NULL,
  url               text        NOT NULL,
  domain            text        NOT NULL,
  source_type       text        NOT NULL,
  scraped_at        timestamptz NOT NULL,
  content_snippet   text,
  cleaned_text      text,
  r2_raw_html_key   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_project_url_unique UNIQUE (project_id, url)
);

-- 14.7 signals — 8 categories per §13.5, importance + uncalibrated confidence
-- Additive (beyond PRD §14) for the kept designed extras: is_saved, dismissed_at.
CREATE TABLE IF NOT EXISTS signals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  category          text        NOT NULL CHECK (category IN (
                       'Competitor Move','Customer Pain Point','Market Opportunity',
                       'Threat / Risk','Trend Signal','Regulation / Policy',
                       'Pricing / Offer Change','Service Demand Signal')),
  description       text        NOT NULL,
  importance        text        NOT NULL CHECK (importance IN ('Low','Medium','High')),
  confidence_score  integer     CHECK (confidence_score BETWEEN 0 AND 100),
  suggested_action  text,
  is_saved          boolean     NOT NULL DEFAULT false,
  dismissed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 14.8 signal_sources — many-to-many: each signal cites ≥1 source
CREATE TABLE IF NOT EXISTS signal_sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id   uuid        NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  source_id   uuid        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_id, source_id)
);

-- 14.9 daily_summaries — upserted on (project_id, summary_date) (§13.6)
CREATE TABLE IF NOT EXISTS daily_summaries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary_date  date        NOT NULL,
  summary_text  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_summaries_project_date_unique UNIQUE (project_id, summary_date)
);

-- 14.10 daily_summary_sources — clickable verification links for the daily summary
CREATE TABLE IF NOT EXISTS daily_summary_sources (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_summary_id    uuid        NOT NULL REFERENCES daily_summaries(id) ON DELETE CASCADE,
  source_id           uuid        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (daily_summary_id, source_id)
);

-- 14.11 usage_counters — atomic budget enforcement (§21.3)
-- One row per (user_id, period_start) — period_start is the calendar-month start (UTC).
CREATE TABLE IF NOT EXISTS usage_counters (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start        date        NOT NULL,
  serp_calls          integer     NOT NULL DEFAULT 0,
  scrape_calls        integer     NOT NULL DEFAULT 0,
  sources_stored      integer     NOT NULL DEFAULT 0,
  signals_generated   integer     NOT NULL DEFAULT 0,
  cap_notice_sent_at  timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_counters_user_period_unique UNIQUE (user_id, period_start)
);
