# Demo quality log

## 2026-09-15 — Setup baseline

Project `0e78bac5-1896-41a3-a40c-20b1474f403d`, isolated staging.

- Checkout/signup/onboarding: completed through the actual local UI and Stripe sandbox; local signed event relay 200.
- Dashboard after setup: zero signals, zero sources, awaiting first brief.
- Last reviewed signal ID / batch: none. No quality score assigned before actual extraction.
- First-run provider and isolated scheduling gates remain pending. See DEMO-QUALITY-PLAN.md.

## 2026-09-15 — Preflight found a monitored-URL mismatch

No paid provider calls were made. The dry-run rejected the stored competitor shape, exposing a real onboarding bug:

| Competitor | UI monitored URL / socials.website | Persisted website_url used by worker |
| --- | --- | --- |
| Atlassian | https://atlassian.com/software/jira | atlassian.com |
| Asana | https://asana.com/ | asana.com |

The onboarding payload uses the display domain, discarding the intended monitored path and URL scheme. This can monitor the wrong product or cause scrape errors. Assigned a targeted fix to IFY-005, including the existing website editor where applicable. Do not alter or reset demo history to bypass this guard; correct through the normal product UI after the fix.

Other checks: daily email toggle is false; OpenRouter public catalog lists the existing fallback gpt-4o-mini but not the configured primary gemini-2.0-flash-001. Demo runner uses the existing fallback in memory, without changing production settings.

## 2026-09-15 — First real batch and review

Website fix integrated as `6fe005c`. Corrected both demo URLs through the normal Settings UI; guarded read-only preflight then passed. No direct data repair or history reset.

**Run:** `1b37a978-64cf-4004-8101-6f1d7b6ad22e`, normal manual quota claim, existing fallback `openai/gpt-4o-mini`. Three SERP calls, seven successful scrape calls; ten stored source rows, seven with at least 200 cleaned characters. Four signals accepted, none rejected; daily summary created for 2026-09-15. Worker says completed but one Google redirect scrape timed out. Operator runner correctly returned a partial-failure exit status; do not retry blindly or call this a fully successful scan.

### Review of all four signals

Scores are a small, subjective first-batch diagnostic, not an estimate of overall product accuracy. Dimensions: relevance / source support / freshness / distinctness / usefulness, each 0–2. Unsupported inference and missing billing qualifiers lower support even where individual source facts are present.

| Signal ID | Claim | Scores | Total | Evidence and problem |
| --- | --- | --- | --- | --- |
| 1303d7ea-074c-4259-859f-ac00adf2558f | Linear ranks as a top issue-tracking tool | 1/1/0/2/0 | 4/10 | Cited monday.com comparison text lists Linear at $10/user/month, but says updated Nov 11, 2025. This is not evidence of a new September 2026 development or strong market position. Suggested action tells the Linear demo to position against Linear. |
| bc6d8005-48a9-4490-a6a5-ad6c1ad39f6f | Motion offers AI project management at $12/user/month | 1/1/0/2/1 | 5/10 | Source comparison table supports the amount but explicitly says billed annually. Signal omits that qualifier; summary says Motion introduced tools without evidence of a new launch/change. |
| 3af50e24-8581-4195-b366-27e639d7c34d | Zendesk highlights the need for issue tracking | 0/1/0/0/0 | 1/10 | Cited page is a generic customer-service tool guide, last updated September 4, 2026. Its existence does not establish a new market trend. Suggested feature expansion is generic and poorly aligned with developer issue tracking. |
| a0cb1d02-87af-49fe-8ac8-4f686601a18c | Freshdesk emphasizes issue tracking | 0/1/0/0/0 | 1/10 | Evergreen vendor advice with no visible publication date in supplied extract; largely repeats Zendesk's generic claim. No concrete event or actionable competitive implication. |

All four have one source, yet the UI originally displayed **Cross-verified** unconditionally. Fixed the label to **Source linked**, using a link icon; singular source count now renders correctly. Verified four updated labels in the live app. This is an evidence-link claim, not factual verification.

### Source and UI evidence

- All four signal citations are Google redirect URLs with domain `google.com`, even though extracted text belongs to Motion, monday.com, Freshworks and Zendesk. The browser displays Google as the publisher, obscuring provenance and creating unstable duplicate identities. Source IDs: `472ce160-6bf6-4293-83a6-a0d01ca3129f`, `911175df-11e9-4d39-9796-097200d91a73`, `020bddf4-4a22-4e3c-8e40-8fef1cc2b2bd`, `f274efe8-dd0c-4cda-b774-e06d0ae5c1e0`.
- Each cited extract is exactly 6000 characters and begins with navigation/marketing boilerplate. Better content extraction should reserve context for article content, dates and conditions.
- Source expansion works. Saved Linear's signal for review; Saved view shows one item and the corrected label.
- A transient dashboard network/stream error appeared while the worker ran. Error-boundary Reload did not visibly recover; full browser reload recovered. Server recorded `The destination stream closed early` (digest 728343066). Cause not established; do not assume a production defect from this local development trace.
- Raw public-source excerpts and operator output retained locally at `/private/tmp/issuefy-demo-quality-sources.json`, `/private/tmp/issuefy-demo-first-run.jsonl`, `/private/tmp/issuefy-demo-first-run-errors.log`. No provider secrets committed.

### Prioritized improvements

1. **Trust and freshness:** require evidence of a dated event or observed material change before labeling a signal new; distinguish first discovery from a new event. An existing prompt instruction was insufficient in this batch, so use structured extraction/validation and evaluation fixtures, not only another admonition.
2. **Provenance:** resolve/validate publisher destinations and retain original discovery URLs separately. Use stable canonical identities and show the publisher and article title in citation controls. Avoid blindly trusting redirects or canonical tags.
3. **Relevance and action:** explicitly distinguish the customer's company from competitors; reject self-competition recommendations and preserve qualifiers such as annual billing. Suppress evergreen advice and consolidate substantially duplicate claims.
4. **Truthful operations:** surface partial failures, usable evidence coverage and actual next-run status. Do not turn an ingestion outage into a quiet-market message or promise tomorrow's delivery without verified scheduling.
5. **Extraction:** reduce boilerplate before the 6000-character cutoff and preserve publication/update dates and relevant table context. Keep existing content snapshots when rediscovering metadata.

Last reviewed batch: job `1b37a978-64cf-4004-8101-6f1d7b6ad22e`; all four IDs above reviewed. Review only new IDs on the next follow-up. The fresh-only operator runner intentionally refuses a second invocation after history exists. A daily staging ingestion path remains to be configured; the daily thread follow-up reviews arrivals and should report this blocker only when newly actionable.
