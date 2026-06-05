-- Stripe subscription columns (Sprint C).
--   stripe_customer_id        — created once per user, stored for portal sessions
--   stripe_subscription_id    — current subscription
--   subscription_status       — trialing | active | past_due | canceled | paused | incomplete
--   current_period_end        — next renewal (drives "renews on X" UI)
--   cancel_at_period_end      — when true, sub will end at current_period_end
--   plan_started_at           — when the current plan took effect (set on create + plan change)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text,
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_started_at        timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer  ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users (subscription_status);

-- Webhook idempotency: persist Stripe event IDs we've already handled to
-- short-circuit duplicate deliveries (Stripe retries on non-2xx, and our
-- handler may be invoked outside Stripe's 5-min dedup window).
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id          text        PRIMARY KEY,        -- Stripe's event.id
  type        text        NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
