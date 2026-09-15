# Issuefy delivery status — 2026-09-15

## Decisions and operating rules

- Checkout first, then onboarding. Preserve all existing data as production.
- Trello: https://trello.com/b/bm7BA77r/issuefy. Detailed baseline review: PROJECT-REVIEW.md. Delivery plan: DELIVERY-PLAN.md.
- Use Astra low reasoning for bounded routine work; deeper independent review for billing, concurrency and authorization. Batch targeted checks and avoid repeating unchanged full builds.

## Production release completed

PR https://github.com/alpyalti/Issuefy/pull/1 merged as `002ea873f06aee1f652616ca4c9a3b6621d2e2ab`.
Vercel deployment `77YuQNCby6JXZT2zjmkBB3PP4tKy` verified Ready, Production, Current, assigned https://issuefy.app.

Scope: patched Next.js/transitive dependencies, reproducible default-peer lockfile, Node tests and GitHub CI. No schema or application feature changes. Independent clean Node 22 install, 10 tests, typecheck, build and production audit passed (0 advisories); all three PR checks passed. Live sign-in initialized with no observed console errors after deployment. Preview public landing rendered; preview Clerk origin/configuration failed authentication initialization.

Rollback reference: prior Vercel artifact `9KYEmRfmshDG4HTDPidQ9DHGKfrY`. Prior dependencies contain known advisories, so prefer forward correction. No rollback executed.

## Stabilization branch: implemented, not deployed

`codex/issuefy-stabilization` integrates:

| Scope | Source commit | Evidence / remaining limits |
| --- | --- | --- |
| Recoverable Stripe webhook and outbox | 7a9401b | Independent mocked and disposable SQL rollback/retry checks; migration 0016 required |
| Shared strict live/test boundary | cf0a805 | 20 independent actual-route/helper tests; reject before billing DB access |
| Serialized recoverable checkout | 96470ea | 35 tests, disposable journal SQL; migration 0018 required |
| Checkout-first activation and atomic project setup | fa2ef01, 54b9bd2 | 22 independent activation tests; actual SQL rollback/retry/quota checks |
| Project owner entitlements | 0cc53cc, 18ae89f | 135 tests; paused paid-project drafting regression closed; atomic quota accounting remains |
| Full response timeout and cancellation | 5712435 | Seven real local-server tests on Node 22/23; broader scrape efficiency remains |

Combined validation: 237 tests passed and one optional SQL smoke test skipped in sandbox. Seven local-server tests initially could not bind loopback (EPERM); all seven passed when rerun with loopback permission. Thus 244 executed tests passed across these runs. Combined typecheck and Node 22 production build passed. The first sandbox build stalled and was stopped before the successful Node 22 build with subprocess permissions. Existing middleware/Edge deprecation warnings remain.

## Mandatory billing release gates

1. Provision/verify isolated database, Clerk and Stripe test resources. Current Vercel Preview shares production variables; do not run state-changing test flows there.
2. `BILLING_DATA_ENVIRONMENT` unset or `production` requires live keys/objects. `isolated_test` requires test keys/objects and cannot be enabled on Vercel production. This marker does not prove data isolation; never enable it on current shared Preview.
3. Apply and validate additive migrations 0016 and 0018 before new handlers, with production backup/recovery readiness and isolated multi-connection PostgreSQL testing first. No production migration executed.
4. Validate real test-mode checkout, webhook retry/concurrency, onboarding and authorization end-to-end in isolated staging.
5. Unknown checkout operations older than 23 hours require operator reconciliation; never delete journals or reset idempotency keys blindly. Keep journal tables on rollback; disable checkout rather than restore unsafe handlers.

## Open work

Account deletion/Stripe cancellation/identity and trial tombstones; atomic quota reservations; durable pipeline jobs; source versioning and analysis backlog; citation/storage retention; migration tooling and observability; full accessibility/end-to-end QA. Existing orphan Stripe customers and external Stripe writers require separate reconciliation. Pending outbox recipient retention must be addressed with deletion workflow.

## Trello synchronization

Saved: IFY-002 Done (production deployed), IFY-014 Doing with release/rollback evidence; IFY-003, IFY-005 and IFY-007 Review & Test; IFY-004 and IFY-009 Doing; IFY-013 Doing with QA evidence.

Browser connection failed during the last updates. Pending synchronization: move IFY-009 timeout increment to Review & Test; update IFY-004 to conditional QA pass/Review & Test; append final completion-mode and shared-helper review results to IFY-003/005/013. These are code-complete increments, not completed broader cards or a deployed billing release.

## Task IDs

- Platform: 01a0a5aa-b899-7fc2-951d-f10ed3bd2432
- Webhook: 01a0a5aa-cdbb-73f0-8370-385ae655d2a5
- Entitlements: 01a0a5ab-6324-7010-bf0b-d3c0d3867ba4
- Activation: 01a0a5b0-f716-7923-a807-0564c051f05a
- Independent QA: 01a0a5b1-0b48-7451-a9e9-5e08a794c890
- Checkout: 01a0a5b5-8fca-7cc1-b04c-06054d4b08ca
- Timeout (Astra low): 01a0a5b7-36f5-7e22-88c2-636ecb094e32
