-- Additive. NULL deliberately means legacy receipt has not been proven complete.
-- Replayed legacy events reconcile current Stripe state rather than old payloads.
ALTER TABLE stripe_webhook_events ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE TABLE IF NOT EXISTS billing_notification_outbox (
  event_id text NOT NULL REFERENCES stripe_webhook_events(id),
  kind text NOT NULL CHECK (kind IN ('plan_changed', 'canceled', 'payment_failed')),
  recipient text NOT NULL,
  plan text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (event_id, kind)
);
CREATE INDEX IF NOT EXISTS billing_notification_pending
  ON billing_notification_outbox (created_at) WHERE sent_at IS NULL;
