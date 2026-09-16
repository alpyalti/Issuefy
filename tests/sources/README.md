# Source accounting regression

Run `ISSUEFY_TEST_PG_BIN=/absolute/path/to/postgresql17/bin node scripts/test-integration.mjs`. Both source database suites are mandatory in the integration registry; missing binaries fail and the runner rejects skips. The test starts a disposable, Unix-socket-only PostgreSQL instance and never reads DATABASE_URL. It verifies metadata and scraped inserts, normalized URL conflicts, refreshes, concurrent same/different URL inserts, UTC monthly owner attribution, and rollback on counter/source failure.

`upsertSource` counts each newly inserted row in the same SQL statement. Refreshes do not increment. The count uses statement time in UTC, not the caller's scrape timestamp. It is an accounting metric, not a new atomic source quota gate. Existing source limits pause discovery through worker checks; metadata discovery now contributes to the count. Historical undercounts are not backfilled.

## Required integration change

In `lib/process-project.ts`, replace the post-scrape `reserveCalls(user.id, "sources_stored")` with `(await getUsage(user.id)).sources_stored`, retaining the existing cap comparison, notice, and pause logic. Do not retain both increments. The worker file is deliberately left to its current owner. Other callers of `upsertSource` receive automatic accounting without changes.
