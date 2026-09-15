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

## Shared-data completion mode gate (follow-up)

Dependency: integrate IFY-003 commit `cf0a805c6ab9519a87975ba1846ca3a97527a28d` (including shared `lib/billing-mode.ts`) before the completion mode follow-up. This older activation worktree was tested using the exact helper extracted from that commit, without changing or committing a duplicate helper.

The completion page and API use the shared environment/key contract. Unset/`production` requires a live key and live objects. `isolated_test` requires a test key and test objects, and is rejected when `VERCEL_ENV=production`. Unknown configuration, missing/unrecognized key, or missing/mismatched object `livemode` fail closed. No flag was enabled: the existing shared Preview must stay live-only until separate DB/auth/provider resources are provisioned.

Session ID mode and configuration are checked before the API's lazy `requireUser`. After a read-only Clerk identity check, Stripe session and expanded subscription modes are verified before user upsert or account reads. The page no longer calls `getOrCreateUser`; dashboard billing-return hints redirect before its lazy upsert. Provider checks are repeated before readiness, including for admins. An unexpanded subscription fails closed. Unlike the original completion path, missing Stripe configuration no longer bypasses checkout verification; other development/admin entry gates are unchanged.

Follow-up evidence: 22 activation tests and all 158 repository tests pass, including actual shared-helper/API tests for production/Preview mode rejection before side effects, missing object modes, explicit isolated test acceptance, live acceptance, and page/legacy-return ordering. Typecheck and production build pass with the dependency helper available. No live provider/DB calls, migrations, environment configuration changes, or deployment.
