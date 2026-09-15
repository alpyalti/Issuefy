# Issuefy demo and signal quality review

## Verified demo (2026-09-15)

- Environment: isolated Neon `issuefy-staging`, database `issuefy_staging`; local app at http://localhost:3001. Production remains untouched.
- Synthetic Clerk development identity: `issuefy-20260915+clerk_test@example.com`. Do not put its password or provider secrets in this file.
- Project: `0e78bac5-1896-41a3-a40c-20b1474f403d`, **Linear — Issuefy Demo**.
- Dashboard: http://localhost:3001/dashboard/0e78bac5-1896-41a3-a40c-20b1474f403d
- Global SaaS/software work-management scenario; competitors Jira/Atlassian and Asana. Three keywords: AI project management, developer workflow automation, issue tracking pricing.
- Real Stripe sandbox trial completed; actual checkout.session.completed event relayed with local signature returned 200. Checkout confirmation advanced into onboarding; six-step onboarding saved the project. This does not verify remote Stripe webhook transport.
- Daily brief email disabled through the account UI and verified false.
- Trello: https://trello.com/c/m9DaU6gF (IFY-016).
- Daily thread follow-up: `review-issuefy-demo-signals`, 11:00 Asia/Dubai. This reviews new batches; it is not proof that ingestion is scheduled.

## Reference sources

Selected for a concrete competitive-intelligence use case with checkable public release announcements:

- Linear: https://linear.app/changelog
- Jira: https://jirareleases.atlassian.com/
- Asana: https://help.asana.com/s/article/release-notes

Linear is the demo company context; the pipeline does not automatically scrape the company's own site. Jira is currently represented as Atlassian in the competitor UI, with https://atlassian.com/software/jira as the website. Watch for cross-product Atlassian noise.

## Daily review protocol

1. Verify the exact environment/project before any access or run. Read the last reviewed batch in DEMO-QUALITY-LOG.md; avoid repeat work.
2. Check ingestion health before interpreting an empty dashboard. Record job/result errors, usable sources, whether extraction actually ran, and current summary timestamp. A completed job can contain partial failures.
3. Review up to 10 new signals (all if fewer), including top-ranked items and at least one lower-ranked item when available. Open original sources and compare individual claims, dates and entities.
4. Score each dimension 0 (fails), 1 (partial), 2 (good): relevance to the demo, factual/source support, freshness, distinctness, and actionable meaning. Save source URL and short rationale. Unsupported material claims fail regardless of total score.
5. Check missed major announcements against the reference set. Distinguish an out-of-scope source from a discovery/extraction failure; do not claim exhaustive recall from this small sample.
6. Record concrete UX friction from reading, opening citations, filtering and saving. Create/update Trello findings with evidence. Propose new features for user decision; bounded existing-behavior fixes may proceed.
7. Notify only meaningful findings, milestones, failures or required action; stay quiet when unchanged. Do not generate filler signals for a quiet day.

## Execution gates

Vercel cron invokes production deployments; local/preview does not inherit a daily schedule. Current production daily scrape is 06:00 UTC (10:00 Dubai). Verify a separately isolated ingestion path before promising tomorrow's brief. Do not invoke production cron for this demo.

A one-shot staging operator runner is being prepared: pin exact database and owner/project, preserve billing/quotas, allow only required existing scraper/LLM credentials in memory, disable email/storage/social effects, and document expected request bounds. These are workload bounds, not hard provider-dollar caps. Default dry-run; explicit execution after review. No first real signal batch has been produced yet.

## Initial observations

- PASS: chosen checkout plan survived signup, sandbox checkout and confirmation into onboarding.
- PASS: manual company setup and competitor URL fallback allowed completion without LLM enrichment.
- UX observation: empty dashboard promises tomorrow's brief and email unconditionally, although this isolated environment has no verified scheduler/email configuration. Track under IFY-008/013; do not interpret as an operational guarantee.
- Pending: first real ingestion, citation quality, saved/filter workflows and longitudinal quality trends.
