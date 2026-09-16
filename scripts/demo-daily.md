# Isolated daily demo ingestion (operator runner)

This separate runner preserves the original fresh-only `demo-brief.mjs` checks
and behavior. Nothing here installs a schedule or calls production cron.

```sh
node --test scripts/demo-brief.test.mjs scripts/demo-daily.test.mjs
node scripts/demo-daily.mjs          # default: read-only DB preflight
node scripts/demo-daily.mjs --run    # explicit execution; paid provider work
```

Requires Node 22+ and installed repository dependencies. The runner reads the
same explicitly selected local configuration files as the approved one-shot
runner: root `.env.staging.local` for isolated DB/test billing and root `.env`
for only ScraperAPI/OpenRouter credentials and pinned model IDs. It clears the
inherited environment before importing application modules. It neither edits
these files nor accepts an alternate DB, project, owner, date, force, or quota
bypass argument. Disabled provider sentinels are refused.

Pins: database `issuefy_staging` at the exact host in `demo-brief.mjs`, project
`0e78bac5-1896-41a3-a40c-20b1474f403d`, owner
`c1f223c5-4449-494d-a30c-13010e8b2560` and its existing synthetic email. Every
immutable demo project/competitor/keyword/market guard is reused. Existing
history and discovery/scrape timestamps are allowed and are never cleared.
Both the project and active/trialing billing must permit work; paused projects
or subscriptions are refused. Mail opt-in must be off, all social inputs empty
except verified competitor website links, and mail/storage/social credentials
are excluded. No separate social worker runs.

## Admission, journals, quotas

- Dry-run connects read-only, validates the current shape and reports conservative
  workload. It neither locks nor imports the worker/provider graph.
- `--run` takes a nonblocking PostgreSQL session advisory lock unique to this
  pinned demo. It holds the lock through snapshot validation, claim, and worker.
- Any pending/running project job from any day blocks execution. Any project job
  attempted on the current **database UTC day**, irrespective of status/type,
  also blocks execution. There is no automatic retry of partial/failed batches.
- It uses the existing `claimManualRefresh(owner, project, false)` unchanged.
  This retains the atomic account-wide rolling quota check, timestamp update,
  and durable pending job. The real worker consumes exactly that claim ID once.
- A crash after admission leaves its existing pending/running job for manual
  investigation. A crash after completion still leaves a same-day attempt.
  Restarting the runner does not bypass those records.
- No migrations, quota changes, journal deletions, summary/signal resets, or
  application changes are included. Session locks disappear on disconnection;
  the job record remains the durable guard.

Keep other staging editors/dispatchers stopped during execution. The advisory
lock coordinates this runner, not arbitrary concurrent project-setting edits.
The app's normal manual admission lock/quotas remain active. The runner does not
freeze project configuration across the entire worker; hosted QA should verify
this isolated operational assumption before scheduling.

## Expected workload and operational decisions

Per admitted run: at most 3 keyword SERP requests; at most the current eligible
source count plus 11 standard scrape targets (2 competitor websites plus up to
9 discovered URLs); at most 3 OpenRouter requests using the already approved
existing fallback `openai/gpt-4o-mini`. Reused URLs and discovery cooldowns can
reduce this. Existing source and provider-cycle quotas still apply. These are
estimates, not hard dollar or wall-time caps, and reported successful scrape
counts are not invoice counters.

Scheduling is deliberately unset. Decide host/process supervision, local-secret
availability, UTC/Dubai run time, log retention/notification destination, and
an explicit budget/stop policy before enabling it. Starter's **rolling 24-hour
manual-refresh quota** remains unchanged: a fixed daily trigger can be refused
if yesterday's claim was slightly later. Treat that as a refusal, never reset
quota or retry automatically. A separate cron quota policy is outside this
runner's scope. The existing daily review automation is not ingestion.

Capture redacted stdout JSONL and stderr to private operator logs. Exit 0 means
preflight passed or the worker reported no errors, not guaranteed new signals or
a summary. Exit 2 means claim refusal or partial/failed worker; exit 1 means a
validation/runtime/locking failure. Inspect errors, summary status, model usage
and source evidence before calling a batch successful.

## Verification limits

Node 22 tests cover changed pins/mode, unchanged fresh-only rejection, dry-run,
same-day repeat, next-day admission, overlapping invocations, paused states,
quota refusal and crash/partial history retention. The daily concurrency test
uses a simulated database/session lock to verify orchestration; it does not
claim a live PostgreSQL lock or paid-worker end-to-end verification. No staging
credentials were read, database accessed, paid run executed or automation added
during implementation. Fresh staging dry-run and an isolated admission/lock
smoke test remain coordinator gates before execution/scheduling.
