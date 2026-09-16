# Source input review — 17 September 2026

Workstream B, baseline origin/main `0a785f8`. Public web reads only; no paid provider calls, database writes, demo edits or deployment. Verification means the public browsing tool returned the described content, not that ScraperAPI ingestion has passed. Publication dates and observation dates are distinct.

## Official inventory

| Publisher / URL | Coverage and observed date | Cadence and access limitations |
| --- | --- | --- |
| Linear — https://linear.app/changelog | Dated product releases; visible entries September 14 and September 3, 2026. | Rolling index, irregular releases. Daily refresh suitable; long page can exceed 6,000 characters. Older entries are not new events on rediscovery. |
| Linear — https://linear.app/pricing | Current plans and billing terms; observed September 17, no publication date established. Basic $10 and Business $16 per user/month with yearly billing. | Event-driven pricing updates; daily comparison requires prior snapshot. Duplicate responsive price text; feature matrix and add-ons must retain context. Linear is the demo's own company, not a competitor. |
| Atlassian — https://confluence.atlassian.com/cloud/blog | Weekly Cloud release index, newest visible interval September 7–14, 2026. | Weekly publication, daily index refresh reasonable. Index has links, not complete release evidence; current worker does not crawl those links. Includes products beyond Jira. |
| Atlassian — https://confluence.atlassian.com/cloud/blog/2026/09/atlassian-cloud-changes-sep-7-to-sep-14-2026 | Dated weekly details, Jira platform releases improvements marked new this week alongside continuing rollouts. | Weekly detail page; retain rollout labels and product headings. Page date alone does not make every repeated rollout a new event. Long multi-product page risks truncation. |
| Atlassian — https://www.atlassian.com/software/jira/pricing | Official Jira pricing endpoint; observed September 17. | Public tool returned title but zero text lines. Pricing extraction NOT verified; do not infer current amounts. Dynamic calculator/seat/currency conditions require rendered verification before adoption. No automatic premium/render escalation. |
| Asana — https://help.asana.com/s/article/release-notes | Official release-notes endpoint; redirected to https://help.asana.com/s/article/release-notes?language=en_US on September 17. | Direct read returned Loading/CSS Error. Search index has older content; it does not prove current September content is ingestible. Treat as blocked pending rendered verification. |
| Asana — https://forum.asana.com/c/forum-en/news/18 | Official announcement forum; August 2026 release-note topic and September activity visible. | Ongoing announcements/monthly release notes. Topic list dates can reflect latest replies; replies/views change independently of product releases. Prefer dated staff announcement body. Existing worker does not crawl topic links. |
| Asana — https://asana.com/pricing | Current plans; observed September 17, no publication date established. Starter $10.99/user/month billed annually; visible monthly alternative $13.49. | Event-driven updates, daily snapshot comparison suitable. Large navigation and duplicate responsive cards; annual/monthly conditions, AI usage allowances and taxes matter. Public readable output does not establish ScraperAPI parity. |

## Existing mechanisms and bounded change

`process-project.ts` discovers active keywords initially and after seven days, merges market variants and stores at most three URLs per keyword. Competitor website targets and competitor-linked sources refresh daily; keyword sources are fetched in their first three days or while lacking content. There is no RSS ingestion, index-link crawler, arbitrary multiple-source editor, or source-specific scheduler. Changing a competitor website does not remove its older linked sources from daily scraping.

`cleaner.ts` formerly flattened all text before its 6,000-character cutoff. The bounded change removes balanced explicit `nav` and `role=navigation` blocks and separates table cells/rows. It keeps article headers, footers, dates, currency, billing and content statistics. Unclosed navigation is retained to avoid deleting subsequent evidence. No customer/domain rules, whole-page revision suppression, model or schema changes.

Retained synthetic fixture `tests/cleaner/fixtures/pricing.html` models the observed navigation/table/billing failure modes; it is deliberately not a claimed raw publisher capture. Regression tests show navigation-only counters do not alter the stored-content hash, while prices, billing cadence, article dates and adoption statistics do. Forum reply/view counters remain unresolved: deleting all numbers or generic tables would destroy useful pricing evidence. This is a narrow cleaner, not a DOM readability engine; unmarked menus, malformed HTML, rowspan/colspan associations, late-page qualifiers and dynamic content remain limitations. Existing snapshots can yield a one-time revision when extraction formatting changes; rollout should inspect those revisions, not blanket-suppress them.

## Provenance gap requiring coordinator decision

`serpPublisherUrl` already validates and unwraps explicit Google destination URLs while preserving opaque CAES wrappers. Existing six regression tests pass, including the retained opaque shape. `standardScrape.finalUrl` always echoes its input; it does not establish a resolved destination. The worker discards that field and stores only the input URL. `sources` and immutable versions lack a separate original discovery URL field. No canonical tag should overwrite identity merely because HTML claims it; no undocumented provider redirect header is trusted here.

Consequently no durable dual-URL provenance improvement is claimed in this patch. Proposed follow-up for coordinator review: preserve original discovery URL separately from a validated provider destination, then define canonical trust/migration/backlog behavior with fixtures before schema changes. Old Google rows must remain intact until an explicit reconciliation strategy is approved.

## Exact proposed demo edits through existing controls (NOT applied)

1. Settings → competitor website/social editor → existing Atlassian: set website to `https://confluence.atlassian.com/cloud/blog/2026/09/atlassian-cloud-changes-sep-7-to-sep-14-2026`; preserve the competitor identity and all other social values. This is a bounded dated-source trial, not a permanent weekly feed. Next week's URL needs an operator update or a separately approved discovery enhancement.
2. Settings → same editor → existing Asana: set website to `https://asana.com/pricing`; preserve identity/socials. First scrape establishes a baseline, not evidence of a price change. Do not substitute the inaccessible help-center shell or noisy forum index as if verified.
3. Defer keyword additions/removals until coordinator reconciles the three currently active keyword texts and plan cap. Exact candidate strings for existing keyword Add control are `site:confluence.atlassian.com/cloud/blog/2026/09 "Jira"` and `site:forum.asana.com "Asana Release Notes" "2026"`. Weekly top-three search discovery is not guaranteed release coverage. Do not delete existing keywords/history merely to fit the cap.
4. Do not add Linear as a competitor; its official changelog/pricing belong in own-company evaluation context. Existing controls do not offer a separate recurring own-company source feed.

Coordinator must review proposed edits and source budget first; changing URLs may add daily sources while prior linked URLs remain. No reset of quota, discovery timestamps or history is proposed.

## Validation

Focused cleaner plus existing redirect provenance regressions: 10 passed. Uses existing local dependencies via ignored node_modules symlink; no package/lockfile changes. Full offline unit suite: 377 passed, 1 existing optional test skipped; typecheck passed. Initial sandbox run could not bind localhost; the permitted rerun passed. No production build or live provider validation was run. No live ingestion or model accuracy claim follows from offline tests.
