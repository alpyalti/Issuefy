# IFY-010 — durable source analysis versions

Base `5440e00`; strict extraction experiment `b5e26f3` is **not included**. Worker APIs and `process-project.ts` remain unchanged.

## Design

Migration `0022_source_analysis_versions.sql` adds a monotonic content revision to sources, immutable analysis snapshots and an exact-event fingerprint ledger. Database triggers enqueue each eligible revision atomically with the successful source write, regardless of caller. Snapshot `captured_at` comes from the successful `sources.scraped_at`, including legacy seeding; FIFO `created_at` remains independent. Retention must use `captured_at` rather than the original source creation date. Same-version refreshes do not rewrite immutable capture time. Snapshots retain up to 6000 characters of current/prior text, title, URL and observed change time. Intermediate revisions are retained even if the source changes again before analysis. Metadata-only rediscovery does not enqueue again and now also preserves the successful content snippet. Retention compaction/same-hash rehydration is not a new revision.

`claimAnalysis` uses short transactions, FIFO creation/id selection and `FOR UPDATE SKIP LOCKED` to claim up to eight versions. Claims have five-minute tokens/leases; failed attempts release with one-minute-per-attempt backoff capped at one hour. Provider calls happen outside DB transactions. Real-time `clock_timestamp()` fences a lease that expires while publication waits for a project lock. Empty successful results complete their version; a drained queue is normal, not a worker failure.

Prompt IDs identify immutable version rows and map back to original source rows when storing citations. Delayed versions retain their before/after evidence; observation time is explicit and is not presented as an event date. This is not the strict/freshness extraction experiment.

Publication serializes on the project row, rechecks daily capacity and atomically stores signals, citation links, fingerprint keys, result payloads, progress cursor and the owner’s signals_generated usage increment (existing UTC-month period semantics). Counter failure rolls back publication. Beyond-cap candidates remain cached until the next UTC day, then resume without another model call. Expired/reclaimed tokens cannot publish. Exact duplicates across revisions and within a model batch are skipped. Fingerprints use source + category + NFKC/case/whitespace-normalized title and description; importance/confidence/action variations do not re-publish the same claim. Matching historical signals are recorded into the fingerprint ledger without editing the signal. Fingerprints survive ordinary signal deletion (`signal_id ON DELETE SET NULL`); explicit source/project deletion cascades.

## Migration and retention coordination

Apply 0022 before deploying this code. Existing eligible source snapshots are queued once; earlier intermediate revisions cannot be reconstructed. Migration does not delete or rewrite historical signals. Baseline processing can produce provider load within existing per-run limits, so inspect queue size before enabling workers.

0021 is worker-task-owned. Root's IFY-011 migration 0023 provides the bounded lifecycle: terminal versions may clear text/results at owner-plan cutoff; pending versions must set `expired_at`, clear claims and text/results when they age out. Claims/completion/release exclude expired rows. Version text columns are nullable for this purpose. **Deploy with the coordinated retention lifecycle; this patch alone does not schedule/execute expiry.** Cleared completed/expired versions keep their unique revision key, preventing unchanged rehydration from restarting analysis.

Analyzer version is explicitly `signals-v1` in both application and queue trigger. A later analyzer-version change requires an intentional migration/enqueue decision; simply changing the application constant would not regenerate history. Rollback application code first; keep additive tables/columns/triggers and stored history. Never drop customer data to roll back.

## Verification

- `node --test tests/source-analysis/extraction.test.cjs tests/sources/*.test.cjs`: 10 passed.
- `RUN_LOCAL_ANALYSIS_DB=1 node --test tests/source-analysis/postgres.test.cjs`: 12 passed including parent suite. Creates its own temporary **socket-only** PostgreSQL instance using local `initdb`/`pg_ctl`, then removes it; never reads DATABASE_URL or contacts an existing database.
- PostgreSQL checks cover intermediate versions, concurrent disjoint claims and ninth/later progress, empty completion, retry backoff/reclaim, exact dedup across revisions, fingerprint survival, cap caching/resumption, expiry/rehydration, publication rollback, lease expiry while waiting on project lock, and actual source upsert preservation after metadata rediscovery.
- `npm test`: 348 passed, two skipped (existing optional integration plus this explicitly gated disposable DB suite). `npm run typecheck` and `npm run build` pass; existing middleware/Edge deprecation warnings. `git diff --check` passes.
- No real provider calls, remote DB writes, production changes, root-checkout edits, deployment, or experimental extraction changes.

## Limits requiring release review

Deduplication does **not** detect semantic paraphrases or consolidate claims across different source URLs. Legacy candidates only match existing signals when normalized title/description/category agree. Normal source URL identity policy is unchanged.

FIFO ensures progress under bounded arrivals, not unlimited throughput: eight versions per invocation can still fall behind incoming volume and some may explicitly expire under retention. Malformed provider responses retry; schema-valid empty outputs complete their version. Any unknown attribution ID rejects/releases the whole batch, including a mixture of valid and unknown IDs; it is never treated as an empty success. No additional provider or queue service is introduced.

Lease loss can waste a provider response but cannot commit stale results. A transaction failure before caching can require another provider call. Usage now commits atomically with publication; failed accounting keeps the version retryable. The daily cap is serialized among this helper's publishers; other independent signal writers must adopt the same lock to obtain a global concurrency guarantee.

The PostgreSQL tests use a minimal disposable schema around real migration/helper SQL, not a full production migration-chain rehearsal. Coordinator should run additive full-chain/retention integration and authenticated staging smoke tests before release. No source evidence-retention policy is silently changed here.
