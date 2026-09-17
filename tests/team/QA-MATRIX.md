# Workstream C — IFY-013 / IFY-015, 2026-09-17

Baseline: current origin/main `0a785f8`; isolated branch `codex/quality-c-qa`.
Read coordinator's QUALITY-MILESTONE-PLAN.md, root RELEASE-STATUS.md (including
final PR7 snapshot), and tests/landing/HOVER-REPRO.md. No deploy or Trello edits.
No external invitation/email, account creation/deletion, billing, permission,
quota or scan mutation. Authenticated checks used only the approved staging
branch and secondary project c4bb9372-b6a3-4951-beb7-96e12f5e8fae.

## Findings and changes requiring independent review

1. Confirmed TeamCard failure bug: cancel/remove decremented displayed seats
   even on HTTP503; offline invite/cancel/remove/role requests rejected without
   usable error feedback. New component-handler regressions reproduced six
   failures against baseline. Failed mutations now retain state, report errors
   through an alert, and permit retry. Successful mutations still refresh.
   Invite email/role and member-role controls now have explicit accessible names;
   remove buttons identify the member. No API authorization policy changed.
2. Confirmed small pricing text contrast: hosted production computed
   `rgb(137,142,150)` on white = **3.295:1**, at 10.5–13px. Pricing description,
   billing/trial terms, price suffix and spec labels now use existing ink-2
   `rgb(86,91,98)` = **6.844:1**. Actual-CSS local fixture verified computed
   description/billing/trial colors and white background. This is a scoped
   correction, not a site-wide contrast pass. Remaining ink-3/ink-4 usages,
   icons, focus contrast against all backgrounds and disabled states need audit.

## Acceptance gap matrix

| Journey / target | Evidence in this increment | Remaining / scope limit |
| --- | --- | --- |
| Owner/editor/viewer/outsider route access | Real route handlers with explicit mocked authorization boundaries: member reads, invite/cancel, role change/removal; editor/viewer self-leave; owner row protected | Mock guards do not independently prove SQL authorization; existing real PG watchlist role/revocation tests retained |
| Editor/viewer invite acceptance | Disposable PG17: missing token404, wrong email409 and no membership, expired409, case-insensitive email acceptance with correct persisted role, consumed token409 | No hosted email/link transport or second-account browser acceptance |
| Seats, races, rollback | Existing real PG tests rerun: last-seat concurrency, duplicate-email serialization, accept/reserve race, cancel/accept lock ordering, rollback and retry | No provider transport or hosted concurrent load claim |
| Provider failure | Mock email throws after reservation: route still201, normalized email, token excluded from response; self-invite/owner-role injection rejected before email | Preserved reservation is not evidence of delivered email; actual delivery recovery remains untested |
| Team UI recovery | Ten component-handler cases cover HTTP/network failure plus successful cancel/remove/role refresh | Hook/JSX harness, not a mounted React browser journey; independent rendered retest required |
| Hosted Team/settings | Existing session reached secondary project; Settings/Team loaded owner row, 1/1 seats and upgrade link; captured error logs empty | Plan is full; no editable invite/member journey exercised remotely |
| Keyboard | Production desktop first Tab reaches Skip to main content. Mobile menu opening focuses Close, Shift-Tab wraps to Start free, Tab then Escape returns Open menu; 2px blue focus outline measured | Broader dashboard modal/screen-reader and focus contrast audit still open; reuse prior dashboard mobile evidence in root release status |
| Contrast | Confirmed production pricing failure and local patched color pass above | Other small muted text remains outside scoped fix |
| Restored scroll | Production Chrome reload preserved y=3652.5 and `navbar float` after page settled; initial top state `navbar` | Post-hydration sample only; no first-paint/pre-hydration frame proof, BFCache/history matrix incomplete |
| Temporal hover | Actual CSS fixture, stationary click at (250,239), tier bounds bottom240: Chrome16.002s/315 samples, one enter/zero exits; in-app33.852s/677 samples, one enter/zero exits. Transform none throughout samples | CSS-only fixture excludes React, OGL/WebGL, animated overlays and production event instrumentation. Earlier HOVER-REPRO supplies baseline oscillation and other selectors |
| Cold load/WebGL | Fresh public navigation rendered content and initialized flat header | Browser observation starts after load; cache clearing/throttling/frame capture not available in supported controls. Cannot close this gate |
| Full-page temporal measurement | Public anchor rendered; subsequent DOM measurement timed out | No new full-page event-count claim. Retain prior hosted staging edge evidence with its stated limits |

## Exact environments

- macOS Chrome **153.0.8010.48** (installed app bundle version), default viewport
  **1571×1040**; public page, read-only staging Settings, CSS fixture.
- Chrome responsive override **390×844**, public mobile focus journey. Override
  reset afterward. This is desktop emulation, not an actual mobile device.
- Codex in-app browser **1280×720**, CSS fixture only. Browser engine/version was
  not exposed by the inventory; do not count it as independent Safari/Firefox
  coverage. Only Chrome and in-app surfaces were advertised.
- Safari, Firefox, actual iOS/Android, reduced-motion/zoom/high-contrast settings,
  pre-hydration filmstrip and sustained WebGL compositor stability: **not tested**.
- Node **23.7.0**, local Homebrew PostgreSQL17, temporary private Unix-socket
  cluster with production DDL. Does not read DATABASE_URL; removed on completion.

## Reproduce and validation

`node --test tests/team/*.test.cjs` runs disposable mocks, no credentials.
`node --test tests/entitlements/atomic-claims.test.cjs` runs isolated PostgreSQL.
`node tests/landing/qa-fixture-server.cjs` serves only CSS and synthetic markup on
127.0.0.1:4317. Open a fresh tab, click (250,239), leave pointer stationary, read
on-page counters after at least 10 seconds. No production request is made by it.
The fixture is deliberately CSS-only; font loading/Next hydration are excluded.

Validation: unit suite **392 passed, 1 existing optional smoke skipped**;
expanded PG harness **21 passed, zero skipped** (20 subtests plus parent).
`next typegen` then TypeScript no-emit passed; diff check passed. Initial direct
TypeScript run lacked generated next-env.d.ts; generation resolved it. Sandbox
blocked localhost/socket tests; authorized rerun outside sandbox passed. No
production build is claimed for this branch; coordinator owns integration build.

Residual Team seat display issue from code review (not fixed here): client bumps
are approximate account-wide distinct counts. Removing someone who remains on
another owned project can understate seats; duplicate cancel clicks also need
pending-state/authoritative-count handling. Server seat admission remains
transactional. Follow up with a separate bounded reproduction before changing
this wider state contract.

IFY-013/015 should remain open for the missing coverage above. Coordinator should
independently retest the patch and decide per-criterion acceptance, not infer
hosted end-to-end or cross-browser completion from local checks.
