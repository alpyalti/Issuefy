# One-shot staging demo brief

Operator utility for the exact fresh Linear demo on staging. Requires Node 22+ and installed repository dependencies (including TypeScript). No additional runtime package is needed.

```sh
node --test scripts/demo-brief.test.mjs
node scripts/demo-brief.mjs
node scripts/demo-brief.mjs --run
```

Default is read-only DB preflight; it does not claim a job or contact providers. `--run` repeats preflight, makes one normal owner manual-refresh claim with admin bypass false, and invokes the actual worker once with that job ID. No automatic retry, quota adjustment, journal deletion, or timestamp reset. The runner reads only the pinned root `.env.staging.local` plus ScraperAPI/OpenRouter keys and explicit model IDs from root `.env`. Inherited environment is cleared before application imports. DB hostname/database, project UUID, owner email, demo inputs, subscription, disabled mail, and fresh source/job/signal/summary history must match the script.

The coordinator checked the public OpenRouter catalog and reported configured primary `google/gemini-2.0-flash-001` absent. This runner explicitly overrides both model slots to the existing configured fallback `openai/gpt-4o-mini` in memory only. Environment files and production are unchanged. Preflight reports this override; preserve actual worker `modelUsed`. The runner does not make a catalog call.

Expected requests for this unchanged fresh shape: 3 SERP calls, at most 11 standard scrapes, at most 3 OpenRouter requests (one extraction and up to two summary attempts). These are code-path estimates, **not enforced request/dollar caps or a wall deadline**. Provider internal model fallback and billing differ from application request counts. Existing product quotas and per-request timeouts remain in force. Keep other writers/workers stopped during preflight/run: snapshot validation is not a lock against later project edits. Optional mail, R2 and Sentry credentials are excluded; social fields must be empty.

Capture stdout JSONL to a private operator file, retaining `claimed` and `worker-result` events. Logs go to stderr and configured credentials are redacted. Exit 0 means dry-run passed or worker returned without errors; it does not promise a summary. Exit 2 means claim refusal or a failed/partial worker result; exit 1 means validation/runtime failure. A process interruption can leave a pending/running job and reserved quota; inspect it manually, never reset/retry automatically.

Inspect full `result.errors`, `modelUsed`, `signalsRejected`, and `summaryStatus`. Zero signals with no model result or provider errors is not evidence of no developments. A model returning zero accepted signals is only a no-signal candidate; confirm usable source content and current UTC summary date/citations. `scrapeCallsUsed` excludes some failed/skipped attempts and is not a provider invoice counter. Sources may exist after discovery without usable scraped content. A rerun on changed history intentionally fails preflight.

Implementation and tests do not execute paid providers. The coordinator reviews the dry-run and explicitly runs the last command.
