# Issuefy delivery plan

Owner: project-management task. Started 2026-09-15.

## Objective

Stabilize the existing paid product, verify critical customer journeys, deploy reviewed increments, and maintain a traceable Trello backlog. Existing scope is the intelligence product described in PROJECT-REVIEW.md; new features, pricing changes, paid infrastructure, and material architecture decisions require the product owner's decision.

## Operating rules

- Trello: https://trello.com/b/bm7BA77r/issuefy. Update the relevant card on every meaningful change: scope, decision, start, implementation milestone, test result, blocker, review, merge, deployment, or rollback. Do not mark work Done until its acceptance evidence is recorded.
- Work in separate Issuefy project tasks and isolated worktrees/branches. One task owns a bounded area; the coordinating task reviews and integrates. Never have multiple tasks editing the shared main checkout.
- Preserve existing production data and infrastructure. Test billing through mocks/test-mode services; do not run real card charges or delete customer accounts to test.
- Keep main deployable. Use small commits and preview verification before production. No deployment of unrelated task changes.
- Revalidate each review finding before changing code. Dependency audit output must be checked against current authoritative advisory data.
- Record tests, limitations, migration requirements, and rollback approach with every delivery.
- No secrets in Trello, task prompts, commits, logs, or screenshots.

## Board workflow

Use the existing To Do, Doing, Done lists and add Review & Test, Ready to Deploy, Blocked / Decisions, and Roadmap / Reference. Keep stable IFY identifiers in card titles. Each card includes problem, scope, dependencies, owner/task, acceptance criteria, evidence, and deployment status. Limit simultaneous implementation to three independent workstreams; the coordinator owns integration and Trello updates.

## Milestones and work packages

### M0 — Baseline and release controls

**IFY-001 — Delivery plan and release baseline (coordinator)**
Capture git/production baseline, organize Trello, open project tasks, record decisions. Baseline local main is b443f47; Vercel currently shows a Ready production redeploy of that history. Verify target deployment and source SHA again immediately before promotion.

**IFY-002 — Dependency remediation and CI (platform task)**
Recheck advisories, update supported patched dependencies, add reproducible test/typecheck/build scripts and CI without exposing secrets. Preserve existing UI and config. Acceptance: installation, typecheck, meaningful regression tests, production build and current audit succeed or remaining applicability is documented. No blanket force upgrades. First candidate for a narrow independently deployable release.

### M1 — Paid customer lifecycle

**IFY-003 — Recoverable Stripe webhook handling (billing task)**
Fix event completion/idempotency, subscription correlation, reordered delivery, actual plan-change notifications. Acceptance: duplicate success applies once; transient DB failure can retry; stale/unrelated events cannot overwrite current entitlement; no false plan-change email. Any schema changes are additive, tested, and documented.

**IFY-004 — Single subscription and durable trial eligibility (billing task, after IFY-003)**
Serialize customer creation, use idempotent operations, reject/reuse overlapping checkout, preserve one-trial policy across retries and cancellation. Acceptance: concurrent first checkout creates one billing identity; existing subscriber cannot acquire accidental duplicate subscription; previous trial cannot be replayed. Keep existing prices and plan structure.

**IFY-005 — First-run activation and atomic setup (activation task)**
Resolve signup/onboarding/checkout order with owner. Save project, owner membership, and initial watchlist transactionally or with explicit resumable state; remove ignored HTTP failures. Verify completed checkout server-side, no query-string entitlement bypass. Acceptance: new non-admin completes chosen flow with Stripe configured; failed setup is visible/recoverable; team invite path still works; selected plan/period survives redirects.

**IFY-006 — Account deletion and identity synchronization (billing task, after IFY-003/004)**
Design retryable billing cancellation and identity cleanup with a deletion marker; preserve identifiers needed to finish cleanup. Synchronize verified email updates. Acceptance: provider failure cannot silently report fully deleted or recreate a tombstoned account; recurring billing is handled before losing mapping; invitation/email behavior follows verified identity. Test with mocks and isolated data. Confirm cancellation policy if it changes customer-facing behavior.

### M2 — Entitlements and monitoring reliability

**IFY-007 — Project-owner entitlements and atomic quotas (entitlements task)**
Unify owner subscription, plan, role and usage context; guard API and workers; correct team quotas, refresh claims, invitation races, source/signal accounting. Acceptance: owner/editor/viewer matrix passes; unrelated membership grants no personal paid entitlement; concurrent requests cannot exceed limits; canceled owners do not trigger paid work outside defined grace policy.

**IFY-008 — Durable job delivery and truthful status (worker task)**
Make dispatch acknowledgement independent of full processing; durable work tracking/retries, per-project lease, partial/failed states, stale-run detection. Assess existing Postgres/Vercel capabilities first. Any new paid queue/provider is a decision gate. Acceptance: more than four slow projects all get durably queued; retries do not duplicate paid work; failed stage is visible and retryable; cron schedule remains intentional.

**IFY-009 — Full-response timeouts and scrape efficiency (platform task)**
Carry timeouts/cancellation through body consumption; bound payloads; deduplicate scrape targets; avoid spending quota for already-skipped work. Acceptance: delayed headers and delayed body both time out; caller cancellation works; repeated target has one fetch; existing providers retain correct behavior.

### M3 — Intelligence integrity and lifecycle

**IFY-010 — Source versions, analysis backlog and signal deduplication (intelligence task)**
Metadata rediscovery preserves content/hash; successful fetch timestamps separated; analyze each changed version with fair backlog selection and event deduplication. Acceptance: failed rediscovery does not erase evidence; unchanged content does not produce duplicates; ninth and later sources are eventually processed. Build a small factuality/freshness evaluation fixture set.

**IFY-011 — Evidence retention and storage lifecycle (intelligence/platform, after IFY-010)**
Preserve citation metadata for retained signals/summaries; inspect R2 lifecycle configuration; unique archive keys and retryable cleanup. Acceptance: expired bulky source content does not remove citation provenance; object cleanup behavior is verified; no destructive production test.

### M4 — Verified release and product polish

**IFY-012 — Migration safety, observability and documentation (platform/coordinator)**
Correct env-file precedence; disposable migration smoke tests; readiness failure HTTP status with private errors; pipeline freshness reporting; README/runbook update. Acceptance: conflicting test env files resolve deliberately; migration chain passes; health reflects DB failure safely; documented schedules/config match implementation.

**IFY-013 — End-to-end QA, accessibility and public navigation (QA task)**
Exercise signup, billing return, setup, project views, refresh, teams, support, account/settings and mobile navigation. Check keyboard focus/modal semantics/contrast and remove misleading placeholder links without inventing company/legal copy. Acceptance: critical paths pass on preview with evidence; remaining decisions documented; no console errors on key paths.

**IFY-014 — Production release and rollback verification (coordinator)**
For each coherent release: review diff/tests, confirm exact SHA and additive migrations, use Vercel preview, verify environment separation, deploy/promote approved scope, smoke-test public and authenticated paths where safe, record deployment URL/SHA, watch readiness/errors, and verify rollback target. Cloudflare changes only where required; do not change DNS or access unnecessarily. Done requires verified live behavior, not merely a successful build.

## Staffing and coordination

1. Coordinator: product decisions, Trello, task assignments, integration, deployment, acceptance.
2. Platform engineer task: IFY-002 initially; platform follow-ups after integration.
3. Billing engineer task: IFY-003 initially; lifecycle follow-ups sequentially.
4. Entitlements engineer task: IFY-007 assessment initially; implementation after shared policy is established.
5. Activation, intelligence, and independent QA tasks opened when dependencies are ready. Avoid speculative idle tasks and overlapping file ownership.

Use the app's configured model for implementation tasks. A separate QA/review task independently evaluates proposed changes before release. Tasks never merge or deploy their own work without coordinator integration.

## Decision log

- Approved 2026-09-15: checkout first, then onboarding; preserve plan choice and verify entitlements server-side.
- Approved 2026-09-15: treat all existing users/data as production and preserve them.
- Deferred until evidence requires it: external durable queue/provider; pricing/trial changes; new features.

## Definition of done

Code reviewed; targeted regression tests pass; typecheck/build pass; security changes audited; migrations tested separately; preview behavior verified; deployment SHA/URL and rollback identified; Trello card contains evidence and accurate state. Work that cannot be verified remains in Review & Test or Blocked, never silently Done.
