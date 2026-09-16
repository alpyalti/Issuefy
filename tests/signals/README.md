# IFY-017 signal grounding — experimental candidate

Base: `3a69734`. **Do not deploy this extraction candidate without staging model evaluation.** Coordinator is shipping the independent summary fix first. No source, signal, or summary history is changed by this patch.

## Contract and enforcement

New AI candidates require a strict evidence object: source quote, subject, business attribute, dated/scheduled event or material-change kind, explicit date text and normalized date, before/after values where relevant, and action relationship/target. The provider JSON schema and Zod schema both require these fields. The server validates against the exact truncated source snapshots supplied in that request before any signal insert.

- Quotes must match a complete supplied sentence exactly and include the stated subject. Dated titles must be a substring of that sentence. Persisted descriptions use the evidence sentence, not generated narrative. A price-bearing quote also includes the immediately following sentence to retain adjacent qualifiers such as “Billed annually.” Oversized descriptions abstain rather than truncate.
- Dated developments require an explicit event-date spelling in the same quoted sentence. The ISO date must be valid and match that spelling. `EVENT_MAX_AGE_DAYS=14` is an inclusive UTC-day cutoff; future dates do not qualify as past developments. No scraped/discovered timestamp is used as an event date.
- `scheduled_event` is accepted for Industry Event with a supported date today or later. There is no arbitrary upper bound on a future event date.
- Date support includes ISO, unambiguous dotted day.month.year, CJK year/month/day and exact long-date renderings from English, French, German, Spanish, Italian, Portuguese, Turkish, Arabic, Japanese and Chinese locales. Ambiguous slash dates/yearless dates abstain; no English event-verb list gates multilingual claims.
- Observed changes require the existing one-hour `last_changed_at` window (now excludes future timestamps), supplied prior/current sentences, distinct old/new values and identical surrounding subject/terms after replacing the changed value. Before must be absent from current and after absent from prior text. First discovery or equivalent values cannot qualify. Stored description labels Previously/Now; observed time is not labeled the event date.
- Own-company Competitor Move subjects are rejected. Only actions explicitly classified as competing with the own company are omitted; other actions are retained. Exact company name/host and the leading part of an em/en-dash-annotated display name are compared. The actual `Linear — Issuefy Demo`, null-website fixture is covered. Ordinary hyphenated brands are not split.

## Evidence

18 focused regressions cover all four documented demo failure patterns, exact quote/date fabrication, 14-day UTC boundary, future events, localized dates, self actions/decorated demo name, before/after support and adjacent billing conditions. The actual extraction module is tested with mocked provider/DB dependencies to assert grounded fields are inserted and unsupported candidates never reach writes; evidence beyond the supplied 6000-character snapshot is rejected. Full repository suite: 354 passed, one existing integration test skipped. Typecheck and production build pass (existing middleware/Edge deprecation warnings). No paid calls, live DB writes, migrations, credentials or environment changes.

## Limitations and release decision

This is an evidence-consistency check, **not semantic proof**. A correctly quoted sentence can be false, irrelevant, misleading, or describe a page update rather than a business event. Event meaning, business materiality, category, confidence, action relationship and general advice remain model judgments. No claim that all generic/evergreen statements or all self references are detected. A cosmetic single-value substitution can satisfy the structural change test if the model mislabels its business attribute.

Strict full-sentence/date-in-same-sentence requirements reject common valid dated-header + body articles, punctuation-free pricing tables, unsupported locale spellings, complex changes and legitimate paraphrased titles. This can substantially reduce signal volume. The date window is a conservative internal policy requiring staging acceptance, not a newly approved product freshness promise. Only the adjacent sentence is retained for price context; qualifiers elsewhere in the page are not semantically reconstructed. Em-dash identity aliases can be ambiguous and do not replace a canonical organization identity system.

The expanded evidence object consumes the existing 2500 output-token budget, so realistic model completion/abstention rates must be evaluated. No new evidence JSON column is added: descriptions preserve accepted quotes, while structured validation fields are transient. Existing duplicate-analysis/backlog behavior is unchanged.

Required before production: coordinator-run staging extraction against the real demo snapshots plus legitimate multilingual dated-header/table/change fixtures; review precision **and rejection rate**, category/action accuracy and qualifier retention. Decide whether to loosen sentence/date locality based on measured losses. Revert this code candidate if it starves useful results; no data migration/rollback is needed. Summary files were not edited.
