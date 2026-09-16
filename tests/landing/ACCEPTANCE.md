# Bounded acceptance audit (2026-09-16)

Baseline: main5440e00; coordinator's current RELEASE-STATUS read, including
production stabilization and summary releases. This audit does not deploy.

| Card | Proven evidence | Remaining acceptance |
| --- | --- | --- |
| IFY-003 | Duplicate/reorder/mode/retry tests, independent PG concurrency, hosted actual webhook and duplicate200 | No new blocker found; coordinator should attach existing evidence, not repeat production billing actions |
| IFY-004 | Real PG concurrent identity/checkout and retry journal probes; hosted sandbox trial | Unknown operations older23h remain deliberate operator reconciliation; no quota/journal reset |
| IFY-005 | Atomic setup/rollback and checkout completion tests; hosted signup→trial→six-step setup→dashboard; plan/period preserved | Hosted invitation path evidence not recorded; local invitation concurrency covered under007 |
| IFY-006 | Mock provider-failure lifecycle tests and real PG tombstone/email/outbox tests | Isolated provider recovery end-to-end remains unrecorded; do not delete production accounts to close it |
| IFY-007 | Owner context/roles and real PG manual/invitation concurrency | Source/signal accounting remains outside completed claim work; owner task must close full card scope |
| IFY-009 | Seven real HTTP delayed-header/body/caller-cancel tests pass | Payload bounds, repeated-target single fetch and skip-before-reservation remain unresolved in baseline |
| IFY-012 | Nine env/runner tests, three safe-health tests, independent PG18 migration+backup restore and deployed503 contract | Pipeline freshness reporting unresolved; root README/runbook schedule consolidation coordinator-owned |
| IFY-013 | Hosted critical signup/billing/setup/dashboard +cross-tenant denial already recorded; bounded public navigation/focus patch here | Full hosted teams/support/account/settings recovery, dashboard modal keyboard semantics, contrast and browser-console matrix incomplete |
| IFY-015 | CSS hover reproduction and hosted edge/header checks already recorded | Cold-load prehydration/WebGL and cross-browser coverage not proven |

## Public landing patch

Remove dead About/Careers/Security links without inventing destinations or legal
copy. The existing public hello@issuefy.app address now receives a **draft** via
mailto; the page never claims receipt. The support backend requires an
authenticated user, so it is not reused as a public contact endpoint. Existing
sign-up link is labeled Start free trial instead of Book a demo.

Mobile navigation is hidden from keyboard focus while closed. Opening focuses
Close; forward/reverse Tab wrap inside its named modal; Escape restores the
trigger. FAQ buttons expose expanded state and controlled answer IDs; opening
another answer updates both controls. Layout/animations are retained.

## Checks and limits

20 targeted focus/env/health/timeout tests passed; TypeScript no-emit passed.
Local browser fixture renders the actual landing JSX/CSS and executes actual
LandingChrome/focus helper, with canvas/image/icon and Next link wrappers
stubbed. At390×844: initial modal hidden, open focuses Close, Shift-Tab wraps
to Start free, Tab wraps back to Close, Escape restores Open menu. FAQ1 expanded,
then FAQ2 expanded with FAQ1 collapsed in accessibility tree. No external form
submission, credentials or providers. Default desktop markup inspected; this is
not full Next hydration, WebGL, contrast or hosted-auth evidence. The temporary
tab and viewport override were cleaned up.
