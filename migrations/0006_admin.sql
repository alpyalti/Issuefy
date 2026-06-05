-- Admin role column (Sprint D).
-- DEFAULT 'user' so existing rows backfill safely. After migration, you can
-- elevate yourself with:
--   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Partial index — only admin rows are stored, keeping the index tiny.
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role) WHERE role <> 'user';

-- Optional: index for the admin "this month" aggregation across usage_counters.
CREATE INDEX IF NOT EXISTS idx_usage_counters_period ON usage_counters (period_start DESC);
