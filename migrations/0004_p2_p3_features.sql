-- P2/P3 feature batch — additive columns across users, projects, signals.
-- All defaults backfill existing rows automatically.

-- Notification bell (batch 1): track when the user last visited the dashboard
-- so we can show "N new signals since you were here".
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at timestamptz;

-- Signal personal notes (batch 2): user-attached note + when they wrote it.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS user_note         text,
  ADD COLUMN IF NOT EXISTS user_note_updated_at timestamptz;

-- Project pause / archive (batch 2): is_active false → worker skips the project
-- (Stage 1 SERP + Stage 2 scrape) but rows + signals stay intact for browsing.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- The active-projects view used by the dispatcher already lists projects with
-- ≥1 active competitor OR ≥3 active keywords; an additional filter on
-- projects.is_active is enforced in code (see lib/process-project.ts).

-- "Suggested action done" toggle (batch 3): users can mark a recommended
-- action as completed to clear it from their next visit's prominence.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS action_done_at timestamptz;
