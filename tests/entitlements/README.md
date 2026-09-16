# IFY-007: owner-scoped entitlements, first increment

Run `node --test tests/entitlements/*.test.cjs` after installing dependencies.
The Node runner transpiles production TypeScript in isolated VMs with mocked
DB/provider boundaries. No database, credentials, migrations or paid calls are used.

Coverage: owner/editor/viewer against all four plans and nine subscription
states; personal operations cannot inherit team subscriptions; unrelated active
callers cannot entitle lapsed targets; competitor/keyword limits and refresh plan
and usage follow the owner; project reactivation; preserved admin/development
bypasses; missing/inactive worker accounts fail closed; five paid worker entry
points stop before provider calls or writes.

## Validation

- 135 tests pass, including composed route/draft/guard coverage for paused projects.
- `tsc --noEmit --incremental false` passes.
- Initial increment: `next build --webpack` passes, with existing middleware/Edge runtime warnings.
  Paused-project follow-up validated with the full entitlement suite and TypeScript.
- Default Turbopack build cannot use this worktree's symlink to the existing
  installation outside its filesystem root. Integration should run the normal
  build with platform's clean local dependency installation.

## Scope and integration notes

No schema or production data changes. Revert the commit to roll back.

- API role checks remain first; worker billing checks are uncached and resolve
  only the target project's owner. Owner ID and plan are returned together for
  route quotas. Existing workers already meter their project's owner.
- Active, trialing, past_due and paused remain eligible. An admin owner and
  Stripe-unconfigured deployments continue to permit work. These policies can
  allow unpaid provider spend; this increment intentionally does not change them.
- The API's existing admin-caller bypass remains, but a worker still evaluates
  its owner. An admin caller cannot make a lapsed non-admin owner's worker run.
- Enrich and recommend-competitors have no target-project context and now require
  personal entitlement, just like project creation. An unpaid invited editor
  can perform project-scoped operations but cannot use those generic enrichment
  endpoints. A future project-scoped enrichment flow can supply owner usage.
- Worker rejection throws before provider calls/writes. Existing internal route
  wrappers may report that as an error; durable dispatch/skip reporting belongs
  to the worker increment. Draft replies and reclassification operate on existing
  leads, so they require owner billing but remain available while daily scans are
  paused. Discovery/scan workers still require an active project.
- The first increment deferred quota races. The atomic follow-up below addresses
  project refresh and invitations; project/watchlist and source/signal accounting
  remain deferred.
- Cancellation during an already-running pipeline is not interrupted; entitlement
  is rechecked when each guarded entry point starts.
- Plan tests explicitly disable BETA_STARTER_LIMITS. Existing default beta mode
  still applies Starter limits to every plan unless configured false.

## Atomic refresh and invitation increment

`atomic-claims.test.cjs` starts a disposable PostgreSQL server on a private Unix
socket, loads the relevant production table DDL, and runs competing transactions
on separate sessions. It never reads `DATABASE_URL`. Set `ISSUEFY_TEST_PG_BIN` to
an installed PostgreSQL binary directory (default local Homebrew PostgreSQL 17).
Without the binaries this integration test is explicitly skipped; unit tests
still run. Temporary clusters are stopped and removed in `finally`.

Validated locally: **147 tests pass, none skipped**, including eleven PostgreSQL
subtests; TypeScript and diff checks pass. Real lock waits are observed through
`pg_stat_activity`; these are not mocked locking tests. Provider execution is
mocked in the composed route/worker case.

- Refresh locks the owner before reading cooldown and account usage in subsequent
  READ COMMITTED statements. The transaction inserts one pending manual job and
  stamps cooldown. The worker consumes that exact row once, so pending, running,
  historical and failed jobs count exactly once toward the rolling 24-hour cap.
- A paused refresh remains a successful no-op and reserves nothing. If the owner
  lapses or the project pauses after reservation, worker entry rejects and the
  route marks the pending job failed. Accepted attempts that fail remain counted.
  A handler crash before worker start leaves a counted pending row; automatic
  recovery and expiry/retry policy belong to the durable-worker increment.
- Invites lock the same owner before member, duplicate and seat checks, then
  insert. Acceptance holds the owner lock while replacing a pending invitation
  with membership, and locks/rechecks the token against cancellation and expiry.
  Membership and token updates roll back together on failure. Email is sent only
  after reservation commits, outside the transaction.
- NO KEY UPDATE serializes quota transactions while permitting unrelated foreign
  key checks. No transaction is held across provider calls or email delivery.
- No migration or backfill is required. Rollback is a code revert; existing pending
  reservations remain preserved and counted by the old manual-job quota query.
- This is not a global execution lease: cron and separately authorized admin
  refreshes can still overlap. Social/keyword refresh cooldowns, project/watchlist
  creation caps, and source/signal accounting remain out of scope. The latter still
  misses discovery source accounting and atomic signal-cap enforcement.

## Atomic watchlist additions — 2026-09-16

This increment supersedes the watchlist/accounting deferrals above. Both existing
project add routes now use a short READ COMMITTED transaction: lock the target
project with NO KEY UPDATE, verify the expected billing owner, recheck and hold
owner/editor membership, count in a fresh statement, then insert. All competing
additions use the same project lock; no provider work occurs inside it. Success
payloads and 409 cap messages, inactive-item counting, target-owner plan limits,
and existing billing/admin/development policy remain unchanged. A revoked member
waiting on the project lock cannot insert. An insert failure rolls back and frees
the slot for another attempt. No schema migration or existing-row rewrite.

Mutation-path review: the only other competitor/keyword inserts are initial
`createProjectSetup` writes. They validate the complete watchlist and create a new
project, owner membership and items within one transaction; the project is not
visible to competing add routes until commit. PATCH routes cannot move an item
between projects and do not add rows; DELETE only reduces the count. Future
existing-project insert paths must use the shared helper.

Real PostgreSQL route regressions exercise owner/editor competition for the last
competitor and keyword slot, target-owner plan instead of editor plan,
viewer/unrelated-owner rejection, membership revocation during an observed lock
wait, and failed-insert retry. Original 82f4315 routes fail four new concurrency /
revocation cases; fixed routes pass. Validation on Node22.23.2: 372 unit passes,
one existing optional smoke skipped; 80 mandatory PostgreSQL passes, zero skipped;
TypeScript passes. The entitlement harness includes 18 subtests plus its parent.

PR5 already fixed source accounting: `upsertSource` stores and increments the
owner's UTC-month `sources_stored` in one SQL statement only on new-row insertion.
Mandatory `tests/sources/accounting-postgres.test.cjs` verifies discovery/metadata
inserts, scrape refresh without double counting, concurrent conflicts and rollback
on counter failure. Signal publication similarly commits owner usage with accepted
signals and caches cap-deferred results (`tests/source-analysis`). No source
accounting implementation change is needed here.

No remaining code gap is identified in the card's stated refresh/seat/watchlist
and monthly source/signal scope after integrating this increment. Release/CI and
hosted confirmation belong to the coordinator; this branch has not been deployed.
This does not introduce quota enforcement for external SQL writers or change
subscription downgrade behavior while an already admitted operation is in flight.
