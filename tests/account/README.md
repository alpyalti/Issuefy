# IFY-006 account lifecycle

## Dependencies and rollout

Base: `292a757a0e5b79ed313ae5ae0b1d43b18ee3a54e`, including integrated IFY-003 webhook/outbox, shared `billing-mode`, IFY-004 checkout journal, and activation/entitlement changes. Apply additive migration `0020_account_deletion.sql` **before** deploying this code. The migration depends on `0016` and `0018`; it does not delete or backfill existing accounts. It also fixes the contradictory support-author `NOT NULL` / `ON DELETE SET NULL` constraint so another user's support messages survive author deletion.

Current production and shared Preview must keep `BILLING_DATA_ENVIRONMENT` unset or `production`, with live Stripe and Clerk keys. `isolated_test` permits test keys only outside `VERCEL_ENV=production`, after separate database, Clerk and Stripe/webhook resources have been provisioned. The marker is an operator assertion, not proof of isolation. No environment was changed and no provider was called during implementation.

Deploy the account API, identity helper, and DangerZone UI together. The UI now requires `{ok:true,status:"completed"}` before signing out. Failed/pending results keep the same page/session available to retry DELETE. Pending accounts cannot navigate through authenticated application routes.

## Deletion behavior

1. A per-Clerk deletion advisory lock and the same per-user/mode checkout lock serialize deletion against another deletion or checkout. A short identity lock serializes initial tombstone creation against lazy signup.
2. Commit a durable tombstone and billing/checkout snapshot before provider mutations. Freeze entitlements and disable future owned-project scans; suppress pending billing notifications. Database triggers prevent stale checkout writes, webhook reactivation and same-Clerk-ID recreation.
3. Recover any uncertain customer/session operation with its original immutable Stripe key/parameters, within the 23-hour replay boundary. Expire open subscription checkouts, correlate completed sessions, and cancel every nonterminal subscription on the mapped customer. Re-read current Stripe state before advancing.
4. Cancel immediately, with `invoice_now:false` and `prorate:false` (Stripe defaults). No refunds, new final invoices or prorated credits are issued by account deletion. The confirmation UI states this before the user acts. Stripe financial records/customer objects are retained; storage-provider archival retention remains outside this account API's scope.
5. Only then delete the Clerk identity. Successful deletion or authenticated `404/resource_not_found` confirmed by a second read permits advancement. Timeouts, permission errors and generic 404s do not count as success.
6. Transactionally delete local account data and mark the tombstone completed. The tombstone keeps same-identity trial evidence and billing IDs; customer request parameters are cleared at completion. The same Clerk identity stays blocked permanently. This does not identify or prohibit unrelated new accounts.

All phase writes commit on separate connections from the outer advisory-lock transaction, so a crash/rollback cannot erase a provider operation's recovery state. Phase transitions use compare-and-set conditions and cannot regress. Remote cancellation/deletion is retried as a desired state against the same resource, without issuing new payment operations. A lost lock prevents subsequent checkpoints; an already in-flight remote request may still finish, so recovery always re-reads provider state.

Already running scans/provider requests and dispatched email cannot be recalled.

External Stripe Dashboard writers, historical orphan customers without a stored mapping, unknown old checkout outcomes, deleted Stripe customers, and active/future external subscription schedules need operator reconciliation. They are not silently ignored. This app does not invent cancellation/refund policy for externally managed schedules.

## Trusted recovery after authentication is gone

If Clerk deletion succeeds but the following database write fails, the browser may lose authentication before retrying. The durable record remains at `billing_closed` or `identity_deleted`. A trusted backend job/operator must resume it; there is deliberately no unauthenticated public recovery route and no automatic worker was added in this scope.

Inspect only the specifically authorized pending record's `phase`, `last_error_code` and provider IDs. In a trusted server context using the deployment's correctly matched environment, call:

```ts
import { clerkClient } from "@clerk/nextjs/server";
import { requireStripe } from "@/lib/stripe";
import { deleteAccount } from "@/lib/account-deletion";

// Use the Clerk ID from the already authorized, existing tombstone.
const clerk = await clerkClient();
await deleteAccount(existingTombstoneClerkId, requireStripe(), clerk.users, false);
```

The last argument `false` refuses to start a new deletion. Repeated completed resumes do not call providers again. Never remove/reset the tombstone or checkout operation IDs to make a retry succeed. Ambiguous Stripe outcomes older than 23 hours require correlation using the preserved operation metadata/provider request logs before an operator repairs a mapping. There is no blanket reset command.

Rollback: retain migration `0020`, tombstones and snapshots; disable account deletion if needed. Reverting to the old database-first DELETE route would drop billing mappings and is unsafe. Restore/fix the resumable route instead.

## Email and notifications

Only the verified **primary** Clerk email can replace the application's email; no first-address or fabricated-email fallback. A monotonic Clerk profile version prevents an older concurrent read from reverting a newer email. Custom names are preserved. Only the request that inserts a new user sends the welcome email.

Pending billing notices have an account attribution column populated by a trigger for unambiguous recipients. Account deletion suppresses future attributed notices and removes that account's pending notices. Verified email changes remove stale pending notices rather than changing the payload attached to an existing Resend idempotency key. Already dispatched mail cannot be recalled. Ambiguous legacy recipients shared by multiple users block the affected deletion/email change for reconciliation, rather than modifying another account's notices. Previously sent notices are retained. Stripe customer contact-email synchronization is not part of this application-email change.

## Validation

```sh
node --test tests/account/*.test.cjs
TMPDIR=/tmp npm run test
npm run typecheck
npm run build
```

Database tests launch a **new private local PostgreSQL server**, use a unique short `/tmp` Unix socket directory, disable TCP, apply the actual migration chain, insert only synthetic users, exercise real concurrent transactions/locks/triggers, stop the server, and remove only that generated test directory. They never accept `DATABASE_URL`. Set `ISSUEFY_TEST_PG_BIN` to local PostgreSQL binaries if they are not installed at `/opt/homebrew/opt/postgresql@17/bin`; otherwise database tests explicitly skip. The account fixture sets LC_ALL=C for PostgreSQL startup because the credential-sanitizing test runner otherwise removes the locale required by macOS PostgreSQL. Its private socket path is also kept short.

Coverage includes Stripe/Clerk failures and lost responses; expiration/completion races; multiple subscriptions and trial evidence; lock loss; false-success UI handling; wrong-mode configuration; actual migration reruns; pending and completed identity resurrection; real deletion/checkout/registration contention; final transaction rollback; verified/unverified/stale email profiles; welcome-email concurrency; unrelated support-message preservation; and ambiguous legacy notifications.

The current webhook missing-account branch will retry late cancellation events after the user row is removed; the webhook owner should acknowledge verified tombstoned-customer events using the retained mapping in a follow-up. Pending-account events are already suppressed safely by the database guards.

Hosted Neon connection-loss behavior and live Clerk/Stripe integration remain isolated-staging release checks. No real account reads, cancellations, deletions, emails, charges, migrations, pushes or deployments were performed.
