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

## Stabilization branch: implemented, not released to production

`codex/issuefy-stabilization` (draft PR https://github.com/alpyalti/Issuefy/pull/2) includes recoverable webhook/outbox processing (migration 0016), serialized recoverable checkout (0018), strict live/test separation, checkout-first activation, atomic project setup, owner entitlements, refresh reservations and invitation-seat serialization, durable account deletion and identity synchronization (0020), full-response HTTP timeouts, metadata-only source preservation, migration environment handling and a generic no-store health failure response.

Latest billing/account corrections: `2ac7e91` attributes notices to the locked account and recognizes correct-mode deletion tombstones; `ec87406` reproduces shared-email suppression. Independent review PASS with migration 0020 and lifecycle code prerequisites. Immediate account cancellation uses no proration or invoice; actual production subscriptions have not been canceled. Stripe contact-email synchronization remains deferred.

### Final local validation

- `npm run check`: 302 unit tests passed, 1 legacy optional smoke skipped; typecheck and Node 22 production build passed.
- Mandatory disposable PostgreSQL 17 integration suite: 40 passed, 0 failed/skipped/TODO. Billing, account lifecycle, refresh reservations and invitation races run against real isolated databases. CI now requires these harnesses and rejects skipped tests.
- Source preservation: five SQL-contract tests pass; execution of this specific upsert against PostgreSQL remains unverified.
- Logs: `/private/tmp/issuefy-final-check.log`, `/private/tmp/issuefy-final-pg.log`.

## Isolated staging and remaining release gates

Created Neon schema-only branch `issuefy-staging` and blank database `issuefy_staging`. Initial copied-schema users/projects counts were zero. Applied the complete migration chain plus 0020 successfully to the blank staging database. No production migration or customer-data copy performed.

Development Clerk keys and Stripe test products/prices are stored with staging credentials in ignored mode-0600 environment files. Local synthetic Clerk signup reached the checkout-first upgrade page with plan/cadence preserved. Real Stripe SANDBOX Checkout displayed the correct 14-day trial and monthly price. Trial submission, a signed local relay of the actual checkout event (HTTP 200), and full onboarding now pass. The synthetic demo dashboard is created with two competitors and three keywords. Actual remote webhook transport remains unverified.

User explicitly approved uploading staging database credentials, development Clerk keys and Stripe test keys ONLY to the `codex/issuefy-stabilization` Vercel Preview branch. Production was deselected in the environment dialog. Import has NOT succeeded: Chrome extension file upload requires Allow access to file URLs. Existing preview continues to inherit production configuration; do not perform state-changing tests there.

1. Finish branch-only Vercel import and redeploy; verify isolated configuration before hosted writes.
2. Register an actual Stripe TEST webhook and store its endpoint secret for this branch. Current local webhook secret is only for a signed local relay, not proof of remote delivery.
3. Validate test checkout completion, webhook retries, onboarding, authorization and provider-failure recovery end to end.
4. Verify production backup/recovery readiness before additive migrations 0016, 0018 and 0020 and production code rollout. Retain journals/tombstones on rollback.
5. Unknown checkout operations older than 23 hours require operator reconciliation; never reset their journals/idempotency keys blindly.

`BILLING_DATA_ENVIRONMENT=isolated_test` requires test keys/objects and is forbidden on Vercel production. The marker itself does not prove isolation.

## Open work and Trello

Trello remains the delivery tracker: https://trello.com/b/bm7BA77r/issuefy. Updated billing/account, entitlement, source and QA cards with this batch. Account and entitlement increments are in Review & Test. IFY-015 landing-page header flickering is saved in To Do: https://trello.com/c/GYW1zsRX.

Header restored-scroll hydration fix integrated as `b504436`; targeted browser fixture and project typecheck pass. Full-page pricing anchor rendered the floating header correctly; pre-hydration cold-load/WebGL flicker remains unverified.

The user requested a demo account and recurring signal quality evaluation. Demo project and 11:00 Dubai daily follow-up are created; see DEMO-QUALITY-PLAN.md and DEMO-QUALITY-LOG.md. First real ingestion completed with four signals and one scrape timeout. All four were reviewed; quality problems and prioritized corrections are documented in DEMO-QUALITY-LOG.md and Trello IFY-017. Automatic daily staging ingestion is still unconfigured.

Broader durable pipeline jobs, source versioning/fair analysis backlog, signal/source quota accounting, citation/storage retention, accessibility and hosted end-to-end QA remain open. No new feature scope has been approved; present feature ideas after stabilization.

## Task IDs

- Platform: 01a0a5aa-b899-7fc2-951d-f10ed3bd2432
- Webhook: 01a0a5aa-cdbb-73f0-8370-385ae655d2a5
- Entitlements: 01a0a5ab-6324-7010-bf0b-d3c0d3867ba4
- Activation: 01a0a5b0-f716-7923-a807-0564c051f05a
- Independent QA: 01a0a5b1-0b48-7451-a9e9-5e08a794c890
- Checkout: 01a0a5b5-8fca-7cc1-b04c-06054d4b08ca
- Timeout (Astra low): 01a0a5b7-36f5-7e22-88c2-636ecb094e32

Main baseline merged into stabilization as bb55774. Only duplicate CI additions conflicted; resolved tree was byte-identical to the already tested stabilization tree. No production merge performed.

## Demo-driven fixes and evidence

- `6fe005c`: preserve authoritative monitored website in onboarding and Settings; Settings reports Saved only after successful request. Six focused regressions pass; full source-branch suite 308 pass/1 existing skip, typecheck/build pass. Root URL+runner checks:10/10. Actual demo Settings edits and guarded persisted-URL preflight pass.
- Removed unconditional Cross-verified from signal cards; display Source linked and singular source count. Four live labels, citation expansion and Saved workflow verified; final project typecheck passes.
- First demo job `1b37a978-64cf-4004-8101-6f1d7b6ad22e`:4signals, summary created,3SERP,7successful scrapes;10source rows/7usable, one aborted scrape. Normal quota claim preserved. No email delivery or production writes.
- Draft PR2 passed all4checks at bb55774, with no merge conflicts. Later pushes require fresh CI verification; production remains unchanged.
- Quality remediation backlog: https://trello.com/c/Qg2awmCH (IFY-017). Current batch shows stale/evergreen claims, lost pricing qualifiers, self-competitor action, repeated generic advice and Google redirect publisher labels. This small sample is not an overall accuracy estimate.
