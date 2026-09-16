-- IFY-006. Additive schema; no existing account is deleted or backfilled.
-- Depends on 0016 billing outbox and 0018 checkout journal. Apply before code.
-- Never drop/reset these tombstones on rollback: they prevent same-Clerk-ID
-- recreation/trial reset and preserve unfinished external deletion work.
CREATE TABLE IF NOT EXISTS account_deletions (
  clerk_user_id text PRIMARY KEY,
  user_id uuid UNIQUE,
  livemode boolean NOT NULL,
  phase text NOT NULL DEFAULT 'pending' CHECK (phase IN ('pending','billing_closed','identity_deleted','completed')),
  stripe_customer_id text,
  stripe_subscription_id text,
  checkout_snapshot jsonb,
  trial_used boolean NOT NULL DEFAULT false,
  billing_unresolved boolean NOT NULL DEFAULT false,
  last_error_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS account_deletions_pending ON account_deletions(updated_at) WHERE completed_at IS NULL;

-- Monotonic Clerk profile version prevents an older in-flight profile read
-- from reverting a newly verified primary email during concurrent requests.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_profile_updated_at bigint NOT NULL DEFAULT 0;

-- The legacy outbox only stores recipient, which is insufficient when two
-- accounts share an email. Attribute future rows; ambiguous legacy rows require
-- reconciliation rather than suppressing another account's mail.
ALTER TABLE billing_notification_outbox ADD COLUMN IF NOT EXISTS account_user_id uuid;
CREATE INDEX IF NOT EXISTS billing_notification_account ON billing_notification_outbox(account_user_id) WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION guard_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Same short identity lock used by lazy upsert and deletion initialization.
    PERFORM pg_advisory_xact_lock(hashtextextended('ify:identity:' || NEW.clerk_user_id, 0));
    IF EXISTS (SELECT 1 FROM account_deletions WHERE clerk_user_id = NEW.clerk_user_id) THEN
      RAISE EXCEPTION 'Account deletion prevents identity recreation' USING ERRCODE = 'P0001';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM account_deletions WHERE clerk_user_id = OLD.clerk_user_id) THEN
    -- Webhook retries cannot reactivate a pending deletion or replace the
    -- billing pointers being reconciled. The row is retained until completion.
    NEW.subscription_status := 'deletion_pending';
    NEW.email_brief_enabled := false;
    NEW.role := 'user';
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.email := OLD.email;
    NEW.clerk_user_id := OLD.clerk_user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_account_identity_guard ON users;
CREATE TRIGGER users_account_identity_guard BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_account_identity();

CREATE OR REPLACE FUNCTION guard_deleted_account_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM account_deletions WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Account deletion prevents checkout' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS checkout_account_deletion_guard ON billing_checkout_state;
CREATE TRIGGER checkout_account_deletion_guard BEFORE INSERT OR UPDATE ON billing_checkout_state
  FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_checkout();

CREATE OR REPLACE FUNCTION attribute_billing_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matched_id uuid; matches integer;
BEGIN
  IF NEW.account_user_id IS NULL THEN
    SELECT count(*), (array_agg(id))[1] INTO matches, matched_id
      FROM users WHERE lower(email) = lower(NEW.recipient);
    IF matches = 1 THEN NEW.account_user_id := matched_id; END IF;
  END IF;
  IF NEW.account_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM account_deletions WHERE user_id = NEW.account_user_id
  ) THEN
    RETURN NULL; -- Suppress future pending-account mail, never pretend it sent.
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_notification_account_guard ON billing_notification_outbox;
CREATE TRIGGER billing_notification_account_guard BEFORE INSERT ON billing_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION attribute_billing_notification();

-- Existing FK is ON DELETE SET NULL but column was NOT NULL, blocking account
-- deletion for support authors on other users' tickets. Preserve those messages.
ALTER TABLE support_messages ALTER COLUMN author_id DROP NOT NULL;
