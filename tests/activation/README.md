# IFY-005 activation verification

Checkout now precedes paid onboarding. Plan and billing hints are validated and preserved through email signup/sign-in, Google callback, upgrade and canceled-checkout return (checkout URL patch belongs to coordinator/IFY-004). Starter is selectable for an account with no active subscription, even though its default stored plan is Starter.

The new `/billing/complete` page polls a read-only authenticated endpoint for up to 60 seconds. A provided session must belong to the signed-in account by customer and app-user metadata, be complete, have paid/no-payment-required state and an eligible subscription, and match the webhook-committed subscription ID and plan. It never writes subscription state. Legacy `upgraded=1` returns only wait for the user's own committed entitlement; they do not bypass a gate. Provider/network errors can retry; timeout offers explicit checking again and support, without opening another checkout. Admin and Stripe-unconfigured development access are preserved.

`POST /api/projects` accepts an optional validated `setup` watchlist. One transaction locks the owner, rechecks personal status/current plan and project quota, and inserts project, owner membership, competitors and keywords. All callers now insert owner membership atomically. Existing ordinary project creation remains compatible. The wizard sends one checked request, keeps entered values on a failed save, and preserves new-project mode. Keyword-only setup is now reachable. Invitation signup still claims the invitation and falls back to its recoverable invitation page on failure.

## Evidence

- `node --test tests/activation/*.test.cjs`: 13 passed.
- `npm test`: 149 passed (activation, entitlements, platform).
- `npm run typecheck`: passed.
- `npm run build`: passed; existing middleware/Edge deprecation warnings.
- `git diff --check`: passed.
- No live DB, migrations, Stripe calls, charges or production changes were used. Provider, transaction and component timing regressions are mocked; they do not substitute for preview E2E or disposable-Postgres concurrency checks.

## Integration and remaining verification

Coordinator must set checkout `success_url` to `/billing/complete?session_id={CHECKOUT_SESSION_ID}` and preserve `plan` and `billing` in `cancel_url`. Billing webhook stays the sole writer. No schema migration required. Preview QA should exercise Clerk Google and email flows, invitations, delayed webhook, Starter/Growth annual/monthly, canceled checkout and new-project mode. If webhook processing remains broken beyond the wait, users must retry confirmation/contact support; this change does not reconcile or repair billing state.

Setup is atomic but has no request-id deduplication: a connection loss after a successful commit can leave completion uncertain. The error asks users to check the dashboard before retrying, and owner locking still enforces the project cap. Existing historical orphan rows are deliberately not repaired or removed.

Rollback is a code revert only; retain all saved projects and subscriptions. Reverting activation also requires reverting its coordinated checkout return URL change. Avoid restoring the legacy gate bypass.
