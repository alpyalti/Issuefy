-- Email Daily Brief — schema (P0).
--
-- Three additive columns:
--   users.email_brief_enabled          — account-level on/off toggle (default true: opted in)
--   users.email_brief_unsubscribe_token — random token for one-click unsubscribe (CAN-SPAM)
--   daily_summaries.email_sent_at      — send-once guard so a manual refresh
--                                        later the same day doesn't re-fire the email
--
-- Defaults backfill all existing rows automatically. pgcrypto is already loaded
-- by 0001_init.sql, so gen_random_uuid() is available.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_brief_enabled          boolean     NOT NULL DEFAULT true;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_brief_unsubscribe_token text       NOT NULL DEFAULT gen_random_uuid()::text;

-- Token must be unique so /unsubscribe?token=… resolves to exactly one user.
-- Wrapped in DO so re-running the migration won't error on existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_brief_unsubscribe_token_unique'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_brief_unsubscribe_token_unique
      UNIQUE (email_brief_unsubscribe_token);
  END IF;
END $$;

ALTER TABLE daily_summaries
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_unsubscribe_token
  ON users (email_brief_unsubscribe_token);
