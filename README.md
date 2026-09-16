# Issuefy

Issuefy monitors public sources and turns supported developments into daily signals and briefs. It uses Next.js, Clerk, PostgreSQL, Stripe and optional scraping, AI, email and storage integrations.

## Local development

Use Node.js22. Install with `npm ci`, configure the required keys in an ignored `.env.local`, then run `npm run dev`. Keep production and isolated test databases and provider modes separate. Never commit credentials or copy live billing keys into a test deployment.

Run `npm run check` for unit tests, TypeScript and a production build. PostgreSQL integration tests require local PostgreSQL17 binaries and create their own disposable databases with Unix sockets only:

```sh
ISSUEFY_TEST_PG_BIN=/absolute/path/to/postgresql/17/bin node scripts/test-integration.mjs
```

The integration launcher rejects skipped tests and strips inherited database/provider configuration. `npm run audit:production` checks production dependencies.

## Schema changes

`npm run migrate` applies ordered SQL files. Explicit shell variables win, `.env.local` overrides `.env`, and the migration target is displayed without credentials. Verify the intended host/database before any migration. A release requires a private backup, a successful local restore, migration rehearsal and application checks. Migrations0021–0023 must precede the corresponding reliability release. Read the migration files and focused test READMEs; do not run test harnesses against customer databases.

## Scheduled work

Vercel schedules are UTC and apply to production deployments:

| Task | UTC schedule |
| --- | --- |
| Daily source scans | Daily06:00 |
| Social profile refresh | Daily05:00 |
| Lead discovery | Monday/Thursday05:30 |
| Retention and cleanup | Daily04:00 |

Preview/local deployments need their own explicit operator path. A configured schedule is not proof of successful delivery. Check the latest job status, completed stages and errors. Do not promise a fixed local delivery time or email when the environment cannot deliver it.

Daily dispatch persists eligible jobs before delivery. The internal worker acknowledges queued work before processing. A transaction-scoped project lock prevents simultaneous workers, including with transaction pooling. Pending jobs can be redelivered; interrupted started work is marked uncertain and is not automatically replayed because a provider may already have processed it. Existing daily cron or an authorized pending-job retry supplies redelivery; no separate sweeper is configured.

## Evidence and retention

Analysis uses immutable source versions in FIFO order. Completed/empty results are remembered; exact normalized same-source repetitions are deduplicated. This does not guarantee semantic deduplication across publishers or factual truth of every generated statement. Daily briefs require current UTC-day accepted signals and valid linked evidence.

Expired content is compacted while retained intelligence keeps citation metadata. Pending expired analysis is explicitly invalidated. Optional raw HTML uses unique keys and a durable cleanup registry that survives project/account deletion. Failed object deletions retry; previously started keys cannot be reattached. No global bucket expiration rule is required. See `tests/storage/README.md` and `tests/source-analysis/README.md` for behavior and limits.

## Operations and recovery

`/api/health` reports database readiness with HTTP503 on failure and no public exception details. Inspect protected job status and provider logs for scan freshness; readiness alone is not pipeline health.

Rollbacks must preserve new lifecycle semantics. After new checkout, account-deletion, job or retention state exists, reverting to older handlers may lose reconciliation or evidence. Prefer a forward fix or temporarily disable the affected entry point while retaining journals, queue records and citation-preserving cleanup. Do not restore a historical backup over newer customer activity as a routine rollback.

Focused operational and regression notes live under `tests/billing`, `tests/account`, `tests/jobs`, `tests/storage`, `tests/source-analysis`, `tests/sources`, and `tests/landing`. Private operator notes and backups must remain outside public release descriptions.
