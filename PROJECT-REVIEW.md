# Issuefy project review

Reviewed: 15 September 2026

## Executive summary

Issuefy has a coherent product foundation: project-based intelligence, competitor monitoring, keyword discovery, source-backed signals, daily briefs, leads, teams, support, and billing. The code builds successfully, uses strict TypeScript, and has useful shared authorization, validation, and data-access helpers.

The main weakness is correctness across boundaries: signup versus billing, dispatchers versus workers, team members versus project owners, and database writes versus external services. Several comments describe guarantees that the implementation does not provide. These gaps can prevent activation, continue billing deleted users, lose subscription updates, waste API budgets, and produce repeated or incomplete intelligence.

**Recommendation:** prioritize a reliability and billing stabilization release before adding features or expanding paid acquisition. This does not require replacing the stack.

## Scope and verification

- Reviewed application structure, route handlers, authentication and membership helpers, billing, onboarding, monitoring, AI extraction, storage, migrations, support, operational configuration, and representative UI components.
- `tsc --noEmit --incremental false`: passed.
- `npm run build`: passed. The build reports the deprecated `middleware` file convention.
- `npm audit --omit=dev --json`: reports 10 affected dependency entries: 1 critical, 5 high, 4 moderate. Entries include transitive packages and overlapping advisories; this is not a count of independently exploitable application vulnerabilities.
- Executed the actual Stripe handler with mocked Stripe/database dependencies: the first delivery failed with 500; its retry returned 200 `Duplicate`; the failing update was attempted only once.
- Executed the actual shared fetch helper against a local delayed-body server: with a 50 ms timeout, headers arrived at 18 ms and the body completed at 270 ms without an abort.
- No live payments, production database mutations, migrations, external scraping, or authenticated browser journeys were exercised. Findings below are code-backed failure scenarios, with the two local reproductions distinguished above. Deployment configuration, production data, accessibility, and visual behavior still need environment-specific validation.
- Application code was not changed. This report is the only repository addition.

Priority definitions: **P1** = address before relying on the affected production flow; **P2** = material correctness or operational issue for the next stabilization release. The dependency advisory has critical upstream severity; exploitability on the deployment was not tested.

## Highest-priority findings

### 1. P1 — First-run onboarding requires the subscription it has not created yet

**Evidence:** [onboarding submission](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/components/onboarding/OnboardingFlow.tsx:286), [project creation guard](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/route.ts:47), [billing gate](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/billing-gate.ts:164).

The normal signup route leads to onboarding. Onboarding first POSTs a project, then creates competitors and keywords, and only afterward redirects to the plan picker or Stripe Checkout. But project creation already requires an active subscription. Enrichment and competitor recommendations also require one.

**Trigger:** a new non-admin user with no subscribed team membership, on a deployment with Stripe configured. Project creation returns 402, so the checkout step is never reached. Development without Stripe masks this problem.

**Fix:** choose an explicit activation order. Collect the subscription before paid onboarding operations, or persist a tightly limited draft setup that becomes active after verified checkout. Preserve the user's entered setup across that transition. Test first signup with Stripe enabled, not just the beta bypass.

### 2. P1 — Deleting an account leaves its Stripe subscription running

**Evidence:** [account deletion](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/account/route.ts:46).

DELETE removes the database user and then the Clerk identity. It never cancels the Stripe subscription. The database deletion also removes the local customer/subscription mapping that would help recover the situation.

**Impact:** a user can lose the account and billing-management access while recurring charges continue. If Clerk deletion fails, the route still reports success; the surviving identity can subsequently create a fresh database user through lazy upsert.

**Fix:** implement a durable deletion workflow with an explicit billing cancellation step, retryable identity cleanup, and a temporary tombstone that prevents accidental account recreation. Retain the identifiers needed to finish cleanup until it succeeds.

### 3. P1 — Failed Stripe webhook processing cannot recover through retries

**Evidence:** [event deduplication](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/webhooks/stripe/route.ts:50).

The handler commits an event ID before updating subscription state. If the update fails, the request returns 500, but the next delivery sees the already-recorded ID and returns 200 without attempting the update.

**Local reproduction:** first request 500; retry 200 `Duplicate`; one update attempt total. This confirms the concern already mentioned, but deferred, in the older security review.

**Fix:** atomically commit the event's completed state and its database effects, or use durable processing states with retryable claims. Deliver emails through a separate outbox. Simply moving the insert after the handler without concurrency control is insufficient. Stripe explicitly documents duplicate deliveries and retry behavior in its [webhook guidance](https://docs.stripe.com/webhooks).

### 4. P1 — Checkout permits repeated trials and overlapping subscriptions

**Evidence:** [customer lookup and session creation](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/billing/checkout/route.ts:47).

The endpoint reads only `stripe_customer_id`, never checks for an existing active subscription or previous trial, and grants 14 trial days on every Starter checkout. There are no Stripe idempotency keys for customer or session creation.

**Impact:** repeated checkouts can create multiple subscriptions, repeated trial grants, and inconsistent local state. Concurrent first checkouts can create separate customers and overwrite the mapping. A five-second in-memory cooldown does not prevent later requests or concurrent server instances.

**Fix:** store durable trial eligibility, serialize customer creation, reuse valid pending checkout sessions, and route existing subscribers through a controlled subscription-change flow. Use operation-specific idempotency keys.

### 5. P1 — Background dispatchers wait for workers and can leave projects undispatched

**Evidence:** [daily dispatcher](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/cron/daily-scrape/route.ts:71), [worker](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/internal/process-project/route.ts:58). The social and lead dispatchers repeat this pattern.

The dispatcher has a 60-second limit and awaits batches of four fetches. Workers return their HTTP response only after processing completes, with up to a 300-second budget. Avoiding `response.text()` does not make `fetch()` return before those response headers exist.

**Trigger:** the first batch takes longer than the dispatcher's remaining lifetime, or multiple shorter batches cumulatively exceed it. Later projects are never started. HTTP failures are also not checked before logging kickoff success, and the initial response reports every enumerated project as dispatched.

**Fix:** persist jobs before acknowledging them and use durable queue delivery, retries, and per-project execution claims. Distinguish queued, running, completed, partial, and failed states. Next.js confirms that [`after()` remains subject to the route duration limit](https://nextjs.org/docs/app/api-reference/functions/after).

### 6. P1 — Subscription enforcement does not follow the project being operated on

**Evidence:** [generic API gate](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/billing-gate.ts:164), [worker owner lookup](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/process-project.ts:120), [cleanup](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/cron/cleanup/route.ts:44), [project activation update](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/[id]/route.ts:65).

Workers check whether a project is active but not whether its owner has an eligible subscription. Cleanup leaves one active project for canceled higher-tier accounts and excludes canceled Starter accounts entirely. Consequently, daily work can continue for canceled users. The PATCH endpoint can also reactivate projects without a subscription check.

Separately, the API gate admits anyone who belongs to any subscribed project. It does not bind that entitlement to the target project. An invited member can pass the gate for creating their own project or accessing operations on an unrelated lapsed project they also manage.

**Fix:** separate personal subscription checks from project-scoped checks. Resolve the target project's owner, subscription state, plan, and usage account together; apply the same decision at API entry and worker execution. Explicitly define unpaid read-only access and grace-period behavior.

### 7. P1 — Installed production dependencies have security advisories

**Evidence:** [lockfile](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/package-lock.json), [remote image configuration](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/next.config.mjs:13).

The installed versions include Next.js 16.2.7 and sharp 0.34.5. The production audit reports 10 affected dependency entries, including a critical Next.js entry. The image configuration allows remote HTTPS images from any hostname.

The maintainer's [AVIF image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) identifies affected Next.js 16 releases below 16.3.3 and lists 16.3.3 as patched for that advisory. Broad image input acceptance makes this an important surface to address. The separate Windows-hosting advisory should not automatically be treated as applicable to the intended Vercel deployment.

**Fix:** update Next.js and affected transitive dependencies to maintained patched versions, rebuild, and rerun the audit. Restrict image origins where possible or ingest trusted logos into controlled storage. The audit establishes affected versions, not proof that the live site has been exploited.

## Data quality, quotas, and team correctness

### 8. P2 — Source and signal monthly limits are not enforced as advertised

**Evidence:** [source discovery and counters](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/process-project.ts:232), [source cap branch](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/process-project.ts:360), [signal counter](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/signals.ts:294).

SERP discovery inserts source rows without incrementing `sources_stored`. Later scraping updates these existing rows, so the new-row counter does not count them either. When the monthly source limit is exceeded elsewhere, `pausedKeywordDiscovery` only suppresses repeated notices; it does not stop discovery or storage. Signals increment usage after insertion without comparing against `signalsPerMonth`.

The daily source rail is also inconsistent: `storedToday` increments for new rows but not refreshed rows, and parallel batch members see the same value before any increments occur. Scrape budget is reserved even before checking the daily skip condition.

**Fix:** define exactly what each quota measures, enforce reservations and writes atomically, and include every ingestion path. Check caps before paid work where possible. Keep provider-cost units separate from customer-visible source counts.

### 9. P2 — Team operations use the editor's plan instead of the owner's

**Evidence:** [competitor quota](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/[id]/competitors/route.ts:29), [keyword quota](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/[id]/keywords/route.ts:29), [manual refresh quota](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/[id]/refresh/route.ts:45).

These routes authorize membership correctly, then use the calling user's plan. An invited Starter editor on an Agency project is constrained to Starter caps; an Agency editor on a Starter owner's project can use higher caps. The refresh counter counts projects owned by the caller, excluding refreshes on shared projects, while the worker charges the actual owner.

**Fix:** use the same owner-derived entitlement and usage context throughout the request. Test owner/editor combinations across plan tiers and shared-project refresh quotas.

### 10. P2 — Quota checks and job starts are not concurrency-safe

**Evidence:** [project count then insert](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/route.ts:59), [refresh check then stamp](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/[id]/refresh/route.ts:50), [invitation seat calculation](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/projects/[id]/invitations/route.ts:89).

Concurrent requests can both pass project/watchlist counts or the manual refresh timestamp check. The invitation implementation places its count inside INSERT, but that alone does not serialize concurrent statements reading the same available seat. The worker also has no per-project execution lease, allowing cron and manual runs to overlap.

**Fix:** lock the relevant owner/project row within a transaction, use conditional atomic updates or durable reservations, and enforce idempotent job keys. Invitation acceptance should atomically validate and consume the invite so cancellation cannot race with membership insertion.

### 11. P2 — Signal extraction repeatedly analyzes the same small source set

**Evidence:** [source selection](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/signals.ts:139), [unconditional signal inserts](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/signals.ts:270).

The extractor takes only the eight most recently scraped sources, without filtering by whether their current content version was already analyzed. It then inserts new signal IDs on every run. The attribution unique constraint prevents duplicate pairs for the same signal ID; it cannot deduplicate newly created signals describing the same event.

**Impact:** unchanged pages can generate repeated insights and consume AI budget. Sources outside the newest eight can remain unanalyzed as frequently refreshed pages dominate selection.

**Fix:** track analysis by source ID, content hash, and analysis version; process a bounded backlog fairly; add event-level deduplication. Store evidence excerpts and measure factual support, freshness, usefulness, and duplicate rate with a curated evaluation set. A valid source ID establishes attribution, not factual correctness.

### 12. P2 — Discovery can erase previously scraped content

**Evidence:** [metadata-only discovery upsert](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/process-project.ts:232), [upsert overwrite](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/sources.ts:102).

A rediscovered URL is upserted with a title and snippet but no cleaned text. The conflict branch unconditionally assigns the missing cleaned text and null content hash over the existing content, updates the scrape timestamp, and can register a false change. If the subsequent scrape fails or hits a cap, previously useful content remains lost.

**Fix:** separate discovery metadata updates from successful content snapshot writes. Preserve content and its version until an actual replacement scrape succeeds; maintain distinct discovery and successful-fetch timestamps.

### 13. P2 — Onboarding silently accepts failed watchlist saves

**Evidence:** [parallel watchlist submission](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/components/onboarding/OnboardingFlow.tsx:304).

`Promise.allSettled()` results are ignored, and fetch responses are never checked for HTTP errors. Setup proceeds to billing/dashboard even when competitor or keyword saves fail. Once the project exists, revisiting onboarding redirects away, making recovery awkward.

The project row and its owner membership are also inserted separately. A failure between them leaves a project that consumes quota but is invisible to membership-based access.

**Fix:** save the project, owner membership, and initial watchlist in one validated transaction, or implement a resumable draft with explicit per-item failures. Never mark setup complete until required data has persisted.

## Operations and lifecycle

### 14. P2 — Network timeouts cover headers, not response bodies

**Evidence:** [shared helper](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/fetch.ts:13).

The timer is cleared when `fetch()` returns a Response. Callers read `.text()`, `.json()`, and `.arrayBuffer()` afterward, without the timer. A provider can send headers quickly and stall the body until the entire route times out.

**Local reproduction:** the actual helper accepted a body completing at 270 ms despite a configured 50 ms timeout.

**Fix:** keep cancellation active through body consumption, preserve caller cancellation, and enforce response-size limits, particularly for scraped HTML and the public image proxy.

### 15. P2 — Billing synchronization can regress state or send incorrect emails

**Evidence:** [subscription synchronization](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/webhooks/stripe/route.ts:108), [invoice handlers](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/webhooks/stripe/route.ts:148).

Handlers update by customer ID without ensuring the event belongs to the currently relevant subscription. Out-of-order events or events from overlapping subscriptions can overwrite a newer state. Payment success also changes `trialing` to `active` without resolving the subscription's actual status. Stripe explicitly [does not guarantee event ordering](https://docs.stripe.com/webhooks).

The plan-change email compares the new plan with a row read after that plan was already written. That condition is normally true even when no plan change happened, so unrelated subscription updates can send a misleading email.

**Fix:** reconcile against current subscription state, correlate invoice/subscription IDs, and serialize updates per billing account. Compare old and new plans before updating; enqueue notifications only for real transitions. Replace the unverified `upgraded=1` hint with a verified checkout-completion/reconciliation flow.

### 16. P2 — Retention deletes evidence links while leaving the intelligence

**Evidence:** [source cleanup](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/cron/cleanup/route.ts:90), [citation foreign keys](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/migrations/0001_init.sql:132), [raw archive writes](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/process-project.ts:579).

Starter sources expire after 30 days while signals last 180 days and summaries are retained indefinitely. Deleting a source cascades to its citation links, so retained signals and summaries can lose all evidence. Re-scraped pages extend their retention because expiration uses scrape time.

Raw HTML is written to new timestamp-based R2 keys, but application cleanup and account/project deletion remove only database rows. No object deletion path is present. Bucket lifecycle rules may exist outside the repository and must be verified. Millisecond-only keys can also collide between parallel scrapes in the same project.

**Fix:** retain minimal citation metadata for the lifetime of its signal/summary; separately expire bulky content. Implement or verify object lifecycle cleanup and account/project erasure, with collision-resistant archive keys.

### 17. P2 — Database migrations can load the wrong environment

**Evidence:** [migration environment loading](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/scripts/migrate.mjs:19).

The side-effect import `dotenv/config` loads `.env` before `loadEnv()` attempts `.env.local`. Dotenv's default non-overriding behavior means `.env.local` cannot replace those values, contradicting the stated precedence. When the two files target different databases, the migration command can target the unintended one.

**Fix:** remove the preliminary side-effect load, explicitly load files in the documented order while preserving intentional shell overrides, and display the sanitized target host/database before migration execution. Add a migration smoke test against a disposable database.

### 18. P2 — Identity email changes are not synchronized

**Evidence:** [existing-user early return](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/lib/clerk-user.ts:39), [invitation email match](/Users/alpyalti/Desktop/ClaudeProjects/Issuefy/app/api/invitations/[token]/accept/route.ts:62).

Existing database users are returned without refreshing Clerk profile data. There is no Clerk user-update webhook route in this checkout. Changing the primary email in Clerk therefore leaves the app email stale: invitation matching and outgoing briefs/support/billing notifications continue using the old address.

**Fix:** synchronize verified identity updates through a signed webhook or controlled reconciliation, and test email-change behavior across invitations and notifications.

## Improvement opportunities

### Testing and release discipline

No tracked test suite, test/lint scripts, or GitHub workflow was found. Passing compilation cannot validate these stateful flows. Add a small, high-value suite covering:

1. New signup through verified checkout and complete setup.
2. Webhook failures, retries, reordered events, and repeated checkout.
3. Account deletion with billing/identity failures.
4. Owner/editor/viewer authorization and owner-based quotas.
5. Concurrent cap-boundary requests and duplicate jobs.
6. Source rediscovery, unchanged content, and evidence retention.

Use an isolated database and mocked paid providers in CI; add a test-mode end-to-end journey separately. Run typecheck, build, migrations, and dependency review as release gates.

### Observability and recovery

The worker can return `completed` despite stage errors and still advance `last_scraped_at`. Its outer failure path also returns a result object, which the HTTP worker returns as 200. The health endpoint returns 200 even when the DB fails and includes the raw error message. Some failures are swallowed or only added as Sentry breadcrumbs; breadcrumbs are not standalone operational alerts.

Expose freshness and partial completion honestly. Monitor last successful discovery/scrape/analysis/brief, queue lag, stalled jobs, provider latency and cost, and webhook backlog. Return a failure status for failed readiness and protect internal diagnostic details. Persist stage errors so users and operators can retry the specific failed work.

### Maintainability and performance

Keep the existing Next.js/Postgres design, but introduce a shared project entitlement context and durable job/billing services. Break up the largest modules along real boundaries: `social-profile.ts` is about 1,014 lines, `DashChrome.tsx` 807, onboarding 606, and the main processing pipeline 603. Reduce duplicated dispatcher implementations and repeated plan/URL logic.

Deduplicate normalized scrape targets before fetching: competitor homepages can appear both in the direct competitor list and the discovered-source list. Add retry ceilings/backoff for permanently unreadable sources. Query plans and latency need measurement against representative data before index or caching changes. Replace silent fixed-size result truncation with pagination where users need full history.

### Product clarity and UI quality

The application already includes skeletons, empty/error states, role-aware controls, and a skip link. Next, show what was checked, what changed, why an insight matters, its publication time, and the evidence behind it. Prioritize freshness and trustworthy provenance over raw signal volume.

Persist onboarding drafts; provide specific errors and recovery actions for partial saves and billing synchronization. Audit keyboard focus containment/restoration, modal semantics, mobile navigation, contrast, and screen-reader labels in a live browser. Those accessibility items are verification targets, not claims of completed visual testing.

The auth footer's “terms” link points to `/#contact`, and landing-page About/Careers/Security links point to `#`. Replace them with real destinations or remove unavailable navigation. This is a concrete trust/navigation gap; no legal-compliance assessment was performed.

### Documentation and configuration

`LAUNCH-NOTES.md` describes two cron jobs while configuration contains four; it describes Sentry as not integrated although the SDK is installed and used. The old security review had a narrower scope and explicitly deferred the webhook retry defect, so its launch approval should not be treated as assurance for today's whole project.

Add a concise README with setup, environment precedence, migration procedure, architecture, local/test workflows, and deployment recovery. Centralize environment validation, make beta billing bypasses explicit, and document the actual scheduling cadence. Avoid `latest` for the icon package in the dependency manifest.

## Suggested implementation order

| Phase | Work | Exit evidence |
| --- | --- | --- |
| Immediate | Patch affected dependencies; repair onboarding/billing order, account deletion, webhook retries, duplicate subscriptions | Build/audit plus test-mode lifecycle tests pass |
| Reliability | Durable dispatch and job claims; project-owner subscription enforcement; correct quota reservations | Concurrent requests and worker retries cannot duplicate paid work or exceed entitlements |
| Intelligence quality | Preserve source versions; track analyzed content; deduplicate events; retain citations | Stable sources do not repeatedly produce the same insight; backlog is processed fairly |
| Operational maturity | CI, targeted tests, readiness/freshness monitoring, migration safeguards, storage cleanup, documentation and accessibility audit | Failures are visible, recoverable, and covered by repeatable checks |

The highest-return investment is to make activation, billing, monitoring, and evidence retention dependable. The existing feature set is broad enough to support that work without another major feature expansion.
