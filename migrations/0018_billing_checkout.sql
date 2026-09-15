-- IFY-004: durable checkout attempts. Apply before enabling the new route.
-- Additive: no backfill, entitlement changes, or production data removal.
-- Rollout: integrate IFY-003 mode helper/guards and IFY-005 completion first;
-- apply 0018 through the reviewed migration runner, then enable this route.
-- Current shared Preview must keep BILLING_DATA_ENVIRONMENT unset/production.
-- isolated_test is allowed only after separate DB/auth/webhook provisioning.
-- Rollback: retain this table and its rows. Disable checkout if necessary;
-- reverting to the old non-idempotent route reintroduces duplicate billing.
-- Never delete/reset unknown-operation rows to unblock checkout: Stripe may
-- have completed the operation. Reconcile using the saved operation metadata,
-- Stripe request logs and customer/session IDs; use no new key until resolved.
-- Stripe's idempotency retention is at least 24h; application replay stops at
-- 23h. Confirmed expired sessions can be replaced; ambiguous ones fail closed.
-- This journal protects this endpoint's writers. Historical orphan customers
-- and subscriptions created through other Stripe entry points require review.
CREATE TABLE IF NOT EXISTS billing_checkout_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  livemode boolean NOT NULL,
  customer_id text,
  customer_operation uuid NOT NULL,
  customer_started_at timestamptz NOT NULL DEFAULT now(),
  customer_params jsonb NOT NULL,
  trial_used boolean NOT NULL DEFAULT false,
  session_operation uuid,
  session_started_at timestamptz,
  session_params jsonb,
  session_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, livemode),
  UNIQUE (livemode, customer_id),
  CHECK ((session_operation IS NULL AND session_started_at IS NULL AND session_params IS NULL AND session_id IS NULL)
      OR (session_operation IS NOT NULL AND session_started_at IS NOT NULL AND session_params IS NOT NULL))
);
