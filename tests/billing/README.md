# IFY-003 verification and rollout

## Change

`processBillingEvent` uses the existing `withTx` helper. It inserts/locks the unique event receipt, locks the customer account, reads the current subscription from Stripe **after** acquiring that account lock, applies account changes, queues actual transitions, and marks the event complete in one transaction. Any error rolls everything back. Simultaneous duplicate inserts wait on the unique key; different events for an account wait on its row lock. Notifications use a separate transaction and Resend idempotency keys. Notification failure returns HTTP 500; duplicate delivery skips billing and retries its pending outbox.

The existing findings were confirmed in code: receipt committed before effects, updates matched only customer ID, invoices fabricated active/past_due status, and plan comparison happened after writing the new plan. The new route verifies the signature before database/provider operations and catches configuration/database failures inside its processing boundary.

## Checks

- `node --test tests/billing/*.test.mjs`: 15 mocked regression tests; optional PostgreSQL test skips unless enabled. Covers concurrent duplicate success, rollback/retry at account/outbox/completion writes, legacy receipts, unrelated subscriptions/invoices, reordered payloads, actual plan changes, checkout metadata, replacement subscriptions, invoice trial preservation, provider/mapping failure, and notification retries.
- Optional in-memory PostgreSQL SQL/migration smoke test: install `@electric-sql/pglite` into a disposable directory outside this repo, then run `BILLING_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/billing/*.test.mjs`. All 16 passed locally. This executes migration 0005 and additive 0016 twice against memory, injects a real PostgreSQL trigger failure, verifies rollback and retry, and verifies notification persistence. No `DATABASE_URL` is read.
- `npx tsc --noEmit --incremental false` and `npm run build` passed on the original lockfile (Next.js 16.2.7). Dependency remediation belongs to IFY-002; integration must rerun these checks on its patched lockfile.
- The original concurrency regression uses a serialized transaction double. PGlite checks PostgreSQL SQL/rollback, not multiple independent connections. The PostgreSQL 17 harness below now verifies separate-connection locking and rollback; Neon/hosted preview behavior still needs environment-specific QA.

## Rollout requirements

1. Review and apply **0016_billing_webhook_completion.sql** through the coordinator's migration controls before deploying this handler. No real database migrations were executed by this task. The migration adds a nullable completion timestamp, an outbox table, and an index; it preserves all users and existing receipts.
2. Verify Stripe webhook signing secret, Stripe API read access, configured price IDs, and Resend sender/key in the target environment. This handler now reads subscriptions for reconciliation; use a test-mode preview endpoint. Keep the existing checkout/pricing/trial behavior.
3. Deploy the reviewed integration SHA and check subscription, checkout and invoice event delivery plus a forced transient failure in preview. No live charges are needed.
4. Inspect failed historical deliveries and replay affected event IDs deliberately. Existing receipts have NULL completion because their prior effects cannot be proven; replay reconciles **current** Stripe state. An old receipt is not automatically scanned/replayed. Avoid bulk replay without checking account mappings.
5. Monitor failed Stripe deliveries and `billing_notification_outbox WHERE sent_at IS NULL`. Replaying the corresponding Stripe event drains that event's pending notifications without reapplying billing. Stripe retries are finite; unresolved rows after the retry window require operator replay. No new cron/queue infrastructure is introduced here.

## Risks and boundaries

- Subscription reads happen while holding an account transaction lock, trading some lock duration for correctness. API calls have a 10-second request timeout and one network retry. Monitor contention and function timeouts; transaction rollback leaves the event retryable.
- A different subscription cannot replace a nonterminal current subscription. A newer subscription may replace a terminal predecessor. Existing overlapping subscriptions require operator reconciliation/IFY-004; this task neither cancels subscriptions nor silently chooses among multiple live ones. If the mapping is absent entirely, the first reconciled subscription establishes it; prevent duplicate checkout in IFY-004.
- An unknown billing customer returns a retryable failure instead of silently losing initialization. Deleted accounts or unrelated customers on a shared Stripe endpoint need an explicit routing/tombstone policy in IFY-006.
- Resend retains idempotency keys for 24 hours. A crash after successful delivery and before marking sent can duplicate email if retried after that window. Emails are at-least-once outside that provider guarantee; billing effects remain atomic. Do not claim exactly-once external email delivery. Message content/key must remain stable when retrying an unsent event across releases.
- Emails report actual persisted transitions. Initial subscription attachment does not send a plan-change email; repeated status-only events do not send one. Invoice payloads no longer override Stripe's actual subscription status. Unknown prices preserve the existing plan and require price configuration review.
- Rollback: retain additive schema/outbox data and revert the application commit if required. The old handler's unrecoverable-retry defect returns on rollback; do not run old/new handlers concurrently as a steady state, and reconcile failed/pending deliveries after restoring the corrected handler. Never remove receipt/outbox rows to force retries.

References: [Stripe webhook ordering and duplicate guidance](https://docs.stripe.com/webhooks), [Resend idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Shared billing mode guard (integration follow-up)

`lib/billing-mode.ts` exports `expectedBillingLivemode(): boolean` for webhook, checkout, and checkout completion. It throws on invalid configuration. The exact contract is:

- `BILLING_DATA_ENVIRONMENT` unset or `production`: requires `sk_live_`/`rk_live_`; expects strict boolean `livemode === true`.
- `isolated_test`: allowed only when `VERCEL_ENV !== production`, requires `sk_test_`/`rk_test_`; expects strict boolean `livemode === false`.
- Unknown environment, missing/unrecognized key, mismatched key, malformed/missing event mode fail closed. A test key alone never establishes isolation.

The webhook verifies the signature, rejects invalid configuration with HTTP 503 or mismatched/missing event mode with HTTP 400, then enters billing processing. Rejections cannot insert even a receipt, reconcile users, retrieve subscriptions, or drain email. Checkout metadata cannot override event mode.

`node --test tests/billing/webhook-mode.test.mjs` passes 20 actual-route/shared-helper mocked cases. The tests use isolated VM environment values and no provider credentials; both live and test success cases are mocked. No hosted integration test was performed. **Current Preview shares production data: do not set isolated_test there.** Hosted test-mode staging remains blocked until separate database, auth, Stripe/webhook resources are provisioned and verified. This code permits that future isolated Preview; it does not provision or verify isolation. No environment values were changed by this patch.

## PostgreSQL 17 concurrency harness

Run on the integrated branch containing checkout, account deletion, the current migration runner, and migrations through 0020:

```sh
ISSUEFY_TEST_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
  node --test tests/billing/postgres-concurrency.test.cjs
```

The harness defaults to the repository containing the test. When validating from an older isolated worktree, `ISSUEFY_BILLING_TEST_SOURCE_ROOT=/absolute/path/to/integrated/checkout` selects application source and migrations read-only. Omit that override in CI. The only other input is `ISSUEFY_TEST_PG_BIN`; missing binaries cause a skip in the ordinary test suite, so the dedicated PostgreSQL CI job must require binaries and reject skips. PostgreSQL major 17 is asserted.

The harness launches its own temporary cluster with trust authentication and **Unix sockets only**, verifies the empty TCP listen setting, and passes explicit connection parameters to every client. No existing database URL or application environment file is read. Stripe and email are mocked; the database and all application SQL are real. The actual migration runner receives an isolated environment, empty temporary working directory, and a Client class pinned to the private socket; its placeholder URL cannot select a destination. Child processes receive a sanitized environment. Cleanup closes the pool, stops the server, and removes the temporary cluster; if stopping fails it reports failure and retains the directory rather than removing a running server's files.

Validated against stabilization source `292a757a0e5b79ed313ae5ae0b1d43b18ee3a54e` with 13 passing tests (12 nested cases plus the parent), no failures/skips:

- Entire migration chain into a blank database; simultaneous reruns preserve migration names/timestamps and a sentinel user.
- Simultaneous duplicate receipts and distinct account events visibly wait in separate `pg_stat_activity` sessions; reconciliation reads occur only after the row lock.
- An in-flight failed webhook releases its duplicate waiter, which recovers successfully.
- Real PostgreSQL trigger failures on account update, outbox insert, and receipt completion roll back all webhook effects; retry succeeds.
- Concurrent outbox drains serialize; failed sends remain retryable without rebilling.
- A checkout holds a real transaction advisory lock during its mocked provider call; concurrent checkout returns `checkout_busy`; later checkout reuses the persisted identity/session.
- Checkout customer-mapping and session-stamp database failures preserve the separately committed operation journal; retry recovers without minting another customer/session.
- Checkout's advisory/journal connections can overlap webhook's account lock and converge without deadlock or another subscription checkout.

These results replace the earlier separate-connection PostgreSQL validation gap. They do not validate Neon connection/pooler loss, real Stripe/Resend idempotency retention, or hosted auth/provider integration. Existing hosted staging restrictions remain.

## Deletion correlation and explicit notification ownership

**Deployment dependency:** `0020_account_deletion.sql` and account lifecycle commit `2eee6ee0be22d3d90372a9fa60cca749a1b84437` must be integrated/applied before this webhook version. This patch adds no migration and executes none outside disposable tests. Retain the marker and attribution columns on rollback.

After locking a matching user, the webhook reads `account_deletions` by customer or that user's ID. A matching billing-mode marker in any phase (`pending` through `completed`) acknowledges the event by completing its receipt in the existing transaction, with no subscription retrieval, account mutation, or new outbox row. An unknown missing user still returns a retryable processing error. A marker with mismatched mode also fails without consuming the event. The route's signature and strict billing-mode guard still execute first.

The marker read deliberately takes no row lock: deletion finish locks marker then user, so locking marker after user would invert the order. Under the existing READ COMMITTED transactions, a webhook waiting on deletion's user lock sees the committed marker on its next statement. If the webhook wins first, deletion initialization waits and then removes that account's pending outbox rows. Receipt completion failures still roll back and retry normally.

All new notifications explicitly write `account_user_id` from the locked user row. This removes dependence on email inference when two accounts share an address, allowing migration 0020's suppression and deletion cleanup to act on the intended account. No legacy outbox rows are reattributed by this patch.

Validation: 22 mocked processing tests, 20 route/mode tests, optional PGlite SQL smoke, and 18 real PostgreSQL 17 checks (including the parent) pass. PostgreSQL used a temporary export of integrated source `09ef16c` plus this webhook change and the actual full migration chain through 0020. New cases cover deleted users, deletion initialization and finish racing with delivery, webhook-first/shared-email cleanup preserving another user's mail, and unknown/wrong-mode markers. The PostgreSQL harness now requires 0020. No Stripe, Clerk, Resend, or hosted database calls were made.
