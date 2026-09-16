# Durable scan delivery (IFY-008)

## Contract

Migration `0021_durable_jobs.sql` is additive except for widening the existing
status CHECK to include `partial`. It retains every existing job and adds a
nullable UTC daily key, stage, result JSON, dispatch error and supporting indexes.
Legacy daily rows retain null daily keys; no historical deduplication/deletion
or quota adjustment occurs.

Daily dispatch commits jobs for **all** eligible projects before returning 202.
Daily enqueues use `(project_id, daily_key)` uniqueness so repeated cron delivery
cannot mint another daily job. Worker HTTP requests carry only existing job IDs;
the worker acknowledges immediately and uses Next `after()` for processing in
its own 300-second invocation. Never-started delivery can be retried with the
same ID. An HTTP timeout does not erase a job or create a replacement.

Manual refresh still calls the existing atomic owner-quota/cooldown reservation.
It now returns 202 and schedules processing after the response. An explicit
`POST /api/projects/:id/refresh?jobId=...` retries only a pending job owned by
that project, after the existing editor/owner and billing checks. This does not
reserve quota a second time. Running/terminal jobs return 409, never paid replay. Transient errors before
worker admission leave the job pending; explicit project/billing ineligibility
is recorded as a failed entry check.
`GET /api/projects/:id/refresh` exposes the latest job only to project members,
with generic state/stage indicators, not raw provider errors. Dashboard status
polls that record; queued is not described as completed, and partial/failed work
does not advance `last_scraped_at` (last successful full scan).

## Lease and interrupted work

One PostgreSQL **transaction advisory lock** per project spans the worker on a
dedicated connection. An explicit READ COMMITTED transaction pins its backend
even behind a transaction pooler. The lease connection performs only advisory
lock/read statements; application writes, including stale-job classification,
commit separately and remain visible after the lease transaction rolls back.
Statement timeout is 10 seconds; idle-transaction timeout is 290 seconds, within
the hosted 300-second worker limit. Checkpoints keep the lease alive between
provider stages. The connection is destroyed on exit. There is no unpooled URL
or credential/environment change. A live lease cannot be stolen by a row TTL.
Workers check that connection before stages, keywords and scrape batches. A lost lease
stops further stages; already-in-flight provider requests cannot be undone.

When a new delivery acquires the project lock, running jobs older than ten
minutes are classified failed with an uncertain-provider-outcome message. The
same job ID is never reset to pending. A running row younger than ten minutes
blocks the new delivery even if its lease connection disappeared (grace beyond the
hosted worker's five-minute maximum). A live lock always wins, regardless of
row age. Read-only status marks running work overdue after ten minutes even
before another delivery performs classification.

Pending jobs have not reached providers and are safe to redeliver. Pending
manual work remains queued. A previous-day pending daily scan is retained as
failed/superseded, while a current-day scan is queued, avoiding a burst of old
daily scans against today's content. Partial/fatal results retain errors and
stage names; after review a user may request a **new** ordinary quota-controlled
scan. This is not a stage replay/resume engine and does not claim exactly-once
external API billing across crashes or network partitions.

## Cadence and release gates

No cron schedule or paid provider changes. Automatic redelivery is limited to
the existing daily dispatcher. Delayed jobs can also use explicit manual
redelivery. A more frequent sweeper is a separate operational decision; 202
means durably queued, not a delivery-time guarantee. Dispatcher timeout/busy
projects leave jobs pending for those later opportunities.

Apply migration before deploying these routes. Drain old workers before turning
on new dispatch: old code does not participate in the project lease. In a mixed
rollout legacy null-key daily rows cannot deduplicate new keyed jobs; do not run
both dispatch versions concurrently. Preview must verify that `after()` is
supported by the deployed Next/Vercel runtime, returns an early acknowledgement,
and receives the intended independent function duration. No hosted verification
or production migration is performed by this change.

Rollback: pause dispatch and drain all running work first. Retain the additive
schema and job history. Do not roll back to an old dispatcher while new pending
jobs exist (old workers ignore durable IDs); review/disposition those records
without resetting quotas before restoring the old schedule. No down migration
or customer-data deletion is provided.

## Verification

```
node --test tests/jobs/delivery.test.cjs
ISSUEFY_TEST_PG_BIN=/absolute/path/to/postgresql17/bin node scripts/test-integration.mjs
npm test
npm run typecheck
```

The mandatory integration list includes `tests/jobs/postgres.test.cjs`. It
creates/discards a private PostgreSQL cluster on a Unix socket; no DATABASE_URL
is accepted and no providers are invoked. Tests cover >4 durable enqueues,
concurrent daily dedup, real same-project lock exclusion, different-project
progress, live-vs-stale lease handling, duplicate delivery with one mocked
provider-stage call, partial result persistence/freshness, and superseded jobs.
Existing entitlement integration tests still exercise real admission quotas,
rollback, duplicate claim consumption, and pre-start failures after 202.
