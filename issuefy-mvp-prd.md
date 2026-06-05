# Issuefy MVP PRD & Tech Stack

## 1. Product Name

**Issuefy**

## 2. Product Description

Issuefy is a simple AI market intelligence platform that helps businesses monitor public market signals, competitor activity, customer pain points, and potential risks.

The product gives users a short daily AI summary and a list of useful signals with clickable source links.

## 3. Product Goal

The goal of Issuefy MVP is to help a company understand what is happening in its market without manually checking competitor websites, news pages, public industry pages, and other public sources every day.

The MVP should be small, useful, and easy to build.

Issuefy should answer:

* What changed in my market?
* What are competitors doing?
* What customer needs or pain points are visible?
* Are there any risks or threats I should notice?
* What should I pay attention to today?
* Where is the original source?

## 4. Main Product Promise

**Open Issuefy once a day and understand what changed in your market.**

## 5. Target Users

Issuefy is designed for small and medium-sized businesses, agencies, and service companies.

Primary target users: founders, marketing managers, sales teams, business development teams, strategy teams, agency owners.

Example business types: logistics and transportation companies, B2B service companies, marketing agencies, SaaS companies, e-commerce brands, local consumer brands, franchise businesses.

## 6. Main Use Cases

### 6.1 Logistics / Transportation Company

Track competitor route updates, new service pages, warehousing or freight changes, customs clearance trends, market risks, industry news, and customer pain points around delays, pricing, visibility, and reliability.

Example insight: "Several sources this week mention cross-border delivery delays and shipment visibility as key concerns. This may be a good moment to strengthen messaging around reliable tracking and transparent communication."

### 6.2 B2B Service Company

Track competitor positioning, new service offerings, industry demand signals, customer problems, public discussions, business risks.

### 6.3 Agency

Monitor client industries and prepare better strategy ideas.

### 6.4 Consumer Brand

Track competitor campaigns, product trends, customer complaints, market opportunities, public sentiment signals.

## 7. MVP Scope

### Included in MVP

1. User authentication
2. Project creation
3. Optional company profile, captured by company website with auto-enrichment (basic info + social account discovery)
4. Competitor tracking added by website URL, with auto-enrichment (basic info + social account discovery)
5. Editing and removing competitors and keywords after onboarding
6. Keyword tracking (two-stage: search discovery + scraping)
7. Public web scraping using ScraperAPI (standard endpoint)
8. Keyword discovery using ScraperAPI Google Search Structured Data Endpoint (SERP)
9. Source storage with deduplication
10. Clickable source links
11. AI signal extraction using OpenRouter
12. Daily short AI summary
13. Simple dashboard
14. Manual refresh
15. Daily scheduled scraping (dispatcher + per-project fan-out)
16. Transactional emails (welcome, trial, usage notices) via Resend
17. Frontend implementation using the provided custom design system and component zip file

### Not Included in MVP

Payments/billing, team accounts, advanced roles/permissions, full social media scraping (scraping the posts/content of social accounts; note that detecting and storing social account links plus basic site metadata during onboarding enrichment **is** in scope — see section 13.11), advanced forecasting, inventory planning, CRM integrations, Slack integration, email digest/reports, PDF reports, white-label reports, complex analytics, advanced charts, browser extension, mobile app, multi-language support, real-time alerts, shadcn/ui.

Note on pricing: the plan structure is defined in section 21 so the product is built with the right limits and metering. Stripe/billing wiring itself is post-MVP; during beta, apply Starter-equivalent limits to all accounts.

## 8. Final MVP Tech Stack

```text
Frontend:
Next.js (App Router + Route Handlers)
React
TypeScript
Tailwind CSS
Hugeicons (icon library)
Custom provided design system
Custom provided component library from zip file

Hosting:
Vercel

Scheduled Jobs:
Vercel Cron Jobs (dispatcher pattern)

Authentication:
Clerk

Database:
Neon PostgreSQL
Neon Serverless Driver
Plain SQL migration files (no ORM)

Object Storage:
Cloudflare R2 (optional, raw HTML archival only)

Scraping:
ScraperAPI standard endpoint (URL scraping)
ScraperAPI Google Search SDE (keyword discovery)

AI:
OpenRouter (single low-cost model + fallback)

Email:
Resend (transactional + notification emails)

Validation:
Zod

Error Monitoring:
Sentry
```

## 9. Important Frontend Implementation Rule

The frontend must use the provided design system, landing page design, dashboard interface, and component files from the zip package given by the user.

Do not use shadcn/ui. Do not replace the provided visual system with a generic component library. Follow the user-provided design direction as exactly as possible.

If additional components are needed and they do not exist in the provided zip file, create new components that visually match the existing design system. New components must follow the same spacing system, border radius, typography, color palette, button styles, card styles, form styles, icon style, layout rhythm, shadow/border treatment, interaction style, empty state style, and loading state style.

All icons must come from Hugeicons. Do not mix in other icon sets.

The final product should feel like one consistent interface, not a mix of different UI libraries.

## 10. Tech Stack Details

### 10.1 Frontend

Use Next.js (App Router with Route Handlers under `app/api/...`), React, TypeScript, Tailwind CSS, Hugeicons for all icons, the provided custom design system, and the provided custom components.

Purpose: landing page, dashboard, onboarding, project settings, source list, signal cards.

Do not use shadcn/ui, unstyled default HTML components, random external UI kits, generic component libraries that break the provided design direction, or icon sets other than Hugeicons.

### 10.2 Hosting and Deployment

Use Vercel to host the Next.js app, API routes, server-side logic, and manage deployments.

### 10.3 Scheduled Jobs

Use Vercel Cron Jobs, but the cron endpoint must act as a **dispatcher**, not as the worker. See section 13.10 for the required architecture. The cron only enumerates active projects and triggers per-project processing; it must not run all scraping and AI work inside a single invocation.

Plan note: Vercel Hobby crons run once per day and may fire at any point within the scheduled hour, which is acceptable here. The constraint that matters is per-invocation function duration, which is why the work is fanned out per project.

A second daily cron handles data retention cleanup (section 23).

### 10.4 Authentication

Use Clerk for sign up, login, session management, protected dashboard routes, and user identity.

User record sync: do not assume a row exists in the `users` table. On the first authenticated server action (specifically at the start of project creation, and as a guard in any route that needs `users.id`), perform a **lazy upsert**: look up the row by `clerk_user_id`, insert it if missing using the Clerk session claims (email, name), then proceed. No Clerk webhook is required for MVP.

### 10.5 Database

Use Neon PostgreSQL with the Neon Serverless Driver. No ORM (no Drizzle, no Prisma). Use direct SQL queries.

Migrations: add a `/migrations` folder containing numbered plain SQL files (e.g. `0001_init.sql`, `0002_indexes.sql`) and a small Node migration runner script (`npm run migrate`) that applies any unapplied files in order and records them in a `_migrations` table. The full schema in section 14 must be created through these files. Do not rely on hand-created tables.

Store all cleaned source text directly in Neon (a `text` column handles this fine). Neon is the source of truth for everything the app reads.

### 10.6 Object Storage

Cloudflare R2 is **optional in the MVP** and used only for archiving raw HTML when `R2_ENABLED=true`. Cleaned text lives in Neon, so R2 is not required for the app to function. This avoids keeping two stores in sync for content the app actually reads.

If `R2_ENABLED=false`, skip all R2 writes and leave `r2_raw_html_key` null. Build the integration behind a single storage module so it can be toggled with one env var.

### 10.7 Scraping

ScraperAPI is used in two distinct ways:

1. **Standard endpoint (URL scraping):** fetch the HTML of a known URL (competitor websites, and the result URLs discovered from keywords). Handles proxy rotation, CAPTCHAs, and JS rendering.
2. **Google Search Structured Data Endpoint (SERP / SDE):** turn a keyword into a list of organic result URLs as structured JSON. This is the discovery step for keyword monitoring (section 13.3). It is the only supported way to go from a keyword to a set of pages.

Discovery cadence (cost lever): run SERP keyword discovery **weekly**, not daily. The daily scrape re-fetches only the known URL set (competitors + previously discovered keyword URLs). SERP calls are far more expensive than plain scrapes, so this decoupling is the single biggest cost control. Enforce the per-cycle API-call budgets defined in section 21.3.

Scrape concurrency: within a single project, scrape URLs in parallel using a concurrency-capped `Promise.all` (cap at 3–5 concurrent requests) rather than sequentially, to stay inside the function duration budget.

### 10.8 AI Layer

Use OpenRouter for signal extraction, source classification, daily summaries, and simple action suggestions.

Model selection: pick one **low-cost, fast** model as the primary (a Gemini Flash, GPT-4o-mini, or Claude Haiku tier model — verify current availability and pricing on OpenRouter at build time) and configure one fallback model for when the primary errors or rate-limits. Store both as env vars (`OPENROUTER_MODEL_PRIMARY`, `OPENROUTER_MODEL_FALLBACK`).

Token control: before sending cleaned text to the model, truncate it to a sane character budget per source (e.g. first ~6,000 characters). Do not send full raw pages.

Batching: signal extraction may process up to several sources in one request to reduce call volume and cost, as long as each returned signal can still be attributed to a specific source. Keep responses strict JSON (section 16).

### 10.9 Validation

Use Zod to validate forms, API request bodies, and all OpenRouter JSON responses before anything enters the database. Reject and log malformed AI output rather than storing it.

### 10.10 Error Monitoring

Use Sentry to track scraping errors, cron/dispatcher failures, per-project processing failures, API errors, and AI response errors.

### 10.11 Transactional Email

Use Resend for transactional and notification emails. Clerk handles auth emails (verification, password reset, magic links), so Resend covers product emails only:

* Welcome email on first sign-up.
* Trial-ending reminder (section 21.2).
* Limit-reached / usage notices (section 21.4).

Daily or weekly email digests are out of MVP scope (future feature). Store the key as `RESEND_API_KEY`. Keep all email sending behind a single mailer module so templates and triggers are easy to manage.

## 11. Product Structure

Four main parts: Onboarding, Dashboard, Sources, Project Settings.

## 12. User Flow

### 12.1 Sign Up

User signs up with Clerk. Captured: name, email. The company profile (name and, optionally, website + social accounts) is captured during onboarding at the project level (section 12.2), not here. A welcome email is sent via Resend (section 10.11).

### 12.2 Create Project and Company Profile

After signing up, the user creates a project. The flow is website-first: the user provides a website and Issuefy auto-discovers the rest (section 13.11), which the user then confirms or edits.

**Step A — Your company (optional).** The user enters their **company website** only. They can also press "Skip — track competitors and keywords only." The company profile is optional; skipping it is fully supported.

**Step B — Confirm your company.** If a website was entered, Issuefy auto-enriches it (section 13.11) and shows the discovered company name, short description/basic info, logo, and **social media accounts**. Every field is editable, and the user can add, change, or remove any social link before continuing. On this same step the user confirms the remaining project details — project name, industry, business type, target market/region — some of which may be pre-filled from enrichment. If Step A was skipped, Step B is a plain business-details form (project name, optional company name, industry, business type, target market).

Tracking the company lets Issuefy assess opportunities and risks relative to the user's own business (sections 13.11, 16). When skipped, Issuefy runs on competitors and keywords only.

Required fields (always): project name, industry, business type, target market or region. Company website and company social accounts are optional.

Business type options: Logistics / Transportation, B2B Services, Agency, SaaS, Consumer Brand, E-commerce, Other.

On submit, the server performs the lazy user upsert (section 10.4) before inserting the project.

### 12.3 Add Competitors

The user adds each competitor by entering **only the competitor's website URL**. Minimum 1, maximum per plan (section 21).

**Step A — Enter competitor website.** The user types the competitor's website.

**Step B — Confirm competitor.** On the next screen Issuefy shows what it auto-discovered about that competitor (section 13.11): name, short description/basic info, logo, and **social media accounts**. The user can modify any of this — edit the name, fix the description, and add/change/remove social links — before saving. The user then adds another competitor (repeat) or continues.

Manual fallback: the user can edit any field by hand, and if enrichment finds nothing they get an editable empty form so onboarding is never blocked.

### 12.4 Add Keywords

User adds keywords to monitor. Minimum 3, maximum per plan (section 21).

Example logistics keywords: road freight Europe, customs clearance UAE, Türkiye Romania logistics, warehousing solutions, cold chain logistics, groupage transport, freight delays, logistics regulation.

Competitors, keywords, and the company profile can all be changed, edited, or deleted later from project settings (sections 13.1, 17.5).

### 12.5 View Dashboard

The user sees: Daily AI Summary, Latest Signals, Competitor Updates, Market Opportunities, Threats / Risks, Recent Sources.

### 12.6 Open Source Links

The user can click source links from the Daily AI Summary, signal cards, and the Sources page. All source links open the original public page in a new tab.

## 13. Core Feature Requirements

### 13.1 Project Setup

Users can create and manage a project: create, edit details, delete, capture an optional company profile, and add, edit, and remove competitors and keywords.

Acceptance criteria:

* A logged-in user can create a project (lazy user upsert runs first).
* A project can be created in under 2 minutes.
* A project must have at least one competitor or at least three keywords before monitoring starts. The company profile is optional and does not count toward this requirement.
* A competitor can be added by entering only its website URL, with auto-discovered details shown for confirmation (section 13.11).
* The company profile can be skipped; the product works with competitors and keywords only.
* User can see, edit, and remove competitors and keywords in project settings, and edit or remove the company profile.

### 13.2 Competitor Tracking

Competitors are added by website URL. On add, Issuefy enriches the entry with basic info and social account links (section 13.11), which the user confirms or edits before it is saved.

Issuefy scrapes competitor websites daily via the ScraperAPI standard endpoint. For each competitor URL: fetch the page, extract title, meta description (if available), headings, and main page text; store the source URL, scrape timestamp, content snippet, and cleaned text in Neon; optionally archive raw HTML to R2.

Acceptance criteria:

* Competitor source is stored after scraping.
* Source has title, URL, domain, and scraped date.
* User can click the competitor source URL.
* A failed competitor scrape does not break the dashboard or stop other competitors.

### 13.3 Keyword Monitoring

Keyword monitoring is a two-stage pipeline:

**Stage 1 — Discovery (SERP):** for each active keyword, call the ScraperAPI Google Search Structured Data Endpoint to get organic result URLs as JSON. Take the top N results per keyword (e.g. top 3). Discovery runs on a weekly cadence (section 10.7), not every day.

**Stage 2 — Scraping:** feed each discovered URL into the ScraperAPI standard endpoint, then clean and store it exactly like a competitor source, tagged with the originating `keyword_id`. Discovered URLs are then re-scraped on the daily schedule like any known URL.

Each stored keyword source includes: title, URL, domain, source type, related keyword, scraped date, short snippet, cleaned text.

Content quality gate: if cleaned text is empty or below a minimum length (e.g. < 200 characters, common for paywalled or anti-bot pages), skip the source — do not store it and do not send it to the AI layer.

Respect the per-cycle source caps and API-call budgets in section 21.

Acceptance criteria:

* Keyword-based sources are discovered via SERP and then scraped.
* Every stored source has a clickable URL and is connected to the correct project and keyword.
* Empty/blocked pages are filtered out before storage.

### 13.4 Source Storage

Every AI signal and daily summary must connect to original sources.

Source fields: id, project_id, competitor_id, keyword_id, title, url, domain, source_type, scraped_at, content_snippet, cleaned_text, r2_raw_html_key, created_at.

Source types: Competitor Website, Company Website (optional, used only if the user opts to monitor their own site, section 13.11), News, Article, Review, Public Discussion, Industry Page, Other.

Deduplication: enforce a unique constraint on `(project_id, url)`. On re-scrape of an existing URL, **update** the existing row (refresh `scraped_at`, snippet, cleaned text) rather than inserting a duplicate. This prevents the table from filling with copies across daily cron + manual refresh.

Acceptance criteria:

* User can open each source in a new tab.
* The same URL is never stored twice for one project.
* Every signal has at least one source; the daily summary has related sources.
* Broken or missing URLs are not displayed as clickable links.

### 13.5 AI Signal Extraction

After scraping and cleaning, Issuefy sends source content to OpenRouter, which returns structured signals.

Signal categories: Competitor Move, Customer Pain Point, Market Opportunity, Threat / Risk, Trend Signal, Regulation / Policy, Pricing / Offer Change, Service Demand Signal.

Signal fields: id, project_id, title, category, description, importance, confidence_score, suggested_action, created_at.

Importance: Low, Medium, High. Confidence score: 0–100. Note: confidence_score is a model-generated, uncalibrated number. Display it if the design calls for it, but do not build any logic (filtering, prioritization, alerts) that treats it as a reliable measure.

AI rules: use only provided source content, do not invent facts, keep insights short, prefer useful business signals, attach relevant sources, return an empty result if no useful signal exists.

Acceptance criteria:

* AI generates categorized signals from scraped content.
* Each signal has a short business explanation and at least one source.
* Each signal can be displayed in the dashboard.
* Malformed AI output is rejected via Zod and logged, never stored.

### 13.6 Daily AI Summary

Issuefy generates one short daily AI summary paragraph per project.

The summary: shown at the top of the dashboard, one paragraph only, 80–140 words, summarizes the most important recent signals, mentions what matters, includes one simple recommended action when possible, has related clickable sources.

Generation timing: the summary is **upserted on `(project_id, summary_date)`**. It is generated after the daily scrape, and it is also regenerated whenever a manual refresh runs (the refresh updates today's summary row in place). There is at most one summary row per project per day, and it always reflects the latest scrape.

Example summary: "Today's market signals suggest growing attention around cross-border logistics and shipment visibility. Recent competitor and industry sources mention faster delivery, tracking, and customs-related concerns. This may be a useful moment to strengthen messaging around reliability, transparent tracking, and route expertise. Recommended action: create a short LinkedIn post or landing page section focused on dependable cross-border delivery with clear shipment visibility."

Empty summary state: "Issuefy has not found enough useful market signals yet. Add more competitors or keywords, or run a refresh."

Acceptance criteria:

* User sees today's summary on the dashboard.
* Summary is one short paragraph (80–140 words) with related source links.
* Summary makes no unsupported claims.
* Summary is regenerated after both the daily scrape and any manual refresh.

### 13.7 Clickable Sources

Clickable sources are a core feature. The Daily AI Summary has a "View Sources" action; signal cards show source links; the Sources page lists all collected sources; source links open in a new tab; source title, domain, type, and date are visible.

Acceptance criteria: user can click a source from a signal card, from the daily summary, and browse all project sources; all source links open the original URL.

### 13.8 Dashboard

Sections: Daily AI Summary, Latest Signals, Competitor Updates, Market Opportunities, Threats / Risks, Recent Sources.

Daily Summary Card shows: date, summary paragraph, View Sources button, last updated timestamp.

Signal Card shows: title, category, description, importance, confidence score, suggested action, source links.

Recent Sources Card shows: source title, domain, type, scraped date, Open Source button.

Acceptance criteria: user understands the dashboard in under 2 minutes; opens source links easily; clear empty states; loading states during refresh; follows the provided custom dashboard design from the zip file.

### 13.9 Manual Refresh

Users can manually refresh project data.

Requirements: a "Refresh Data" button; show loading state; show last refreshed timestamp; store last manual refresh time in Neon.

Refresh limits (section 21):

* Anti-abuse floor: max 1 refresh per hour per project (all plans).
* Plan quota: total refreshes per day per the plan (Starter 1, Growth 3, Agency 10).
* Each refresh consumes from the account's API-call budget (section 21.3).

Behavior: a manual refresh runs the **same per-project processing path** as the daily job (sections 13.3, 13.5, 13.6) for that single project, including an on-demand discovery + scrape and regenerating today's daily summary. It creates a `scrape_jobs` record with `job_type = manual`.

Acceptance criteria:

* User can manually trigger scraping for their project.
* User cannot refresh more than once per hour, or beyond the daily plan quota (server-enforced).
* User sees an error message if refresh is blocked.
* Refresh creates a scrape job record and updates the daily summary.

### 13.10 Daily Scheduled Scraping

The daily scrape must not run all work inside one function. It uses a dispatcher pattern:

**Dispatcher — `POST /api/cron/daily-scrape`** (Vercel Cron, protected by `CRON_SECRET`):

* Verify the `Authorization: Bearer ${CRON_SECRET}` header.
* Query active projects.
* For each project, trigger the per-project worker (`/api/internal/process-project`) and let it run as a background task (use Vercel `waitUntil` / fluid compute so each worker gets its own duration budget), with a small concurrency cap on how many projects are kicked off at once.
* Return quickly. The dispatcher does no scraping or AI work itself.

**Worker — `POST /api/internal/process-project`** (protected by an internal secret, high `maxDuration`):

* Handles exactly one project.
* Creates a `scrape_jobs` record (`job_type = daily`, status `running`).
* Runs keyword discovery (SERP) only when due (weekly cadence, section 10.7); always re-scrapes the known URL set (competitor + previously discovered URLs) with a concurrency-capped `Promise.all`; cleans and upserts sources; runs AI signal extraction; upserts the daily summary.
* Respects the account's per-cycle call budget (section 21.3); stops issuing new discovery/scrape calls once the budget or source cap is reached (section 21.4).
* Marks the job `completed` or `failed` with an error message.

Reliability note: `waitUntil`-based background tasks are fine for a small number of projects. If project count grows or you need guaranteed retries, swap the dispatcher's trigger step for a real queue (Upstash QStash, Inngest, or Trigger.dev). This requires no schema change.

Acceptance criteria:

* Daily cron runs and dispatches per-project workers successfully.
* Each project is processed in its own invocation; one failed project does not stop the others.
* Scrape and AI failures are logged to `scrape_jobs` and Sentry.
* Daily summaries are generated for projects with enough data.

### 13.11 Website Auto-Enrichment (Company and Competitors)

Onboarding is website-first: for both the user's company and each competitor, the user enters **only a website URL**, and Issuefy fills in the rest for confirmation. This applies during onboarding (sections 12.2, 12.3) and later in project settings (section 17.5).

**Mechanism.** Given a website URL, Issuefy fetches the homepage with the **same ScraperAPI standard endpoint** already used for scraping (section 10.7), then extracts a lightweight profile from the returned HTML:

* **Name** — from `og:site_name`, the `<title>`, or the domain.
* **Basic info / description** — from the meta description or `og:description`.
* **Logo** — from `og:image`, an apple-touch-icon, or the favicon.
* **Social accounts** — by scanning anchor `href`s and known URL patterns for Instagram, Facebook, X/Twitter, LinkedIn (company), YouTube, TikTok, and similar. Store the discovered handle/URL per platform.

This is **link/handle and basic-metadata discovery only**, not social media content scraping (which stays out of scope, section 7). An optional OpenRouter call may normalize or de-duplicate the extracted fields, but a deterministic DOM/regex parse is sufficient and preferred to keep cost near zero.

**Confirmation and editing.** The discovered profile is always shown to the user for review before it is saved. Every field is editable: the user can correct the name and description and can add, change, or remove any social link. Nothing is saved silently.

**Failure handling.** If the fetch fails or nothing is found, Issuefy presents an **editable empty form** so the user can fill the details in by hand. Enrichment never blocks onboarding, and a competitor/company can be created with manual data only. `enrichment_status` on the competitor records `enriched`, `failed`, or `manual`.

**Cost.** Each enrichment is a single standard-endpoint fetch and counts as **one scrape call** against the account's budget (section 21.3). Cache the result briefly so re-rendering the confirm screen or going back a step does not re-fetch.

**How the company profile is used.** When present, the company profile (name, website, description, social accounts) is added to the AI context (sections 16.1, 16.2) so opportunities and risks are assessed relative to the user's own business. When the company step is skipped (`track_company = false`), the AI runs on competitors and keywords only. Competitor profiles likewise enrich competitor context and give the user verified links to each competitor's site and socials.

**Optional company monitoring.** If the user opts in, the company website can also be added to the daily monitored URL set and scraped like a competitor source (`source_type = Company Website`, with `competitor_id` and `keyword_id` both null). This reuses the existing scraping path and is off by default; the required behavior is feeding the company profile to the AI context, not scraping the company's own pages.

Acceptance criteria:

* A competitor can be created by entering only its website URL.
* On the next screen the user sees auto-discovered basic info and social accounts for that website, and can edit any of it before saving.
* The user can optionally enter their company website and see the same auto-discovered profile, editable, before saving.
* The company step can be skipped, and the product still works with competitors and keywords only.
* Enrichment reuses the ScraperAPI standard endpoint and counts as one scrape call against the budget.
* If enrichment finds nothing or fails, the user gets an editable form and onboarding still completes.
* Discovered and edited company/competitor details persist and are available to edit later in settings.

## 14. Database Schema

Created via `/migrations/*.sql`. Add the indexes in 14.11.

### 14.1 users
id, clerk_user_id (unique), email, name, company_name, plan, created_at, updated_at.
(`plan` defaults to a beta/Starter value until billing is wired; see section 21.)

### 14.2 projects
id, user_id, name, company_name, company_website (nullable), company_description (nullable), company_logo_url (nullable), company_socials (jsonb, nullable), track_company (boolean, default false), industry, business_type, target_market, description, last_scraped_at, last_manual_refresh_at, created_at, updated_at.
(The `company_*` fields are populated by website enrichment (section 13.11) and are optional. `track_company` is true when a company profile is in use and false when the user skipped the company step. `company_socials` stores discovered/edited social accounts, e.g. `{"instagram": "...", "linkedin": "...", "x": "..."}`.)

### 14.3 competitors
id, project_id, name, website_url, description (nullable), logo_url (nullable), socials (jsonb, nullable), notes, enrichment_status (nullable: enriched, failed, manual), is_active, created_at, updated_at.
(`name`, `description`, `logo_url`, and `socials` may be auto-filled by website enrichment (section 13.11) and are user-editable. `socials` mirrors the company shape, e.g. `{"instagram": "...", "linkedin": "..."}`.)

### 14.4 keywords
id, project_id, keyword, is_active, last_discovered_at, created_at, updated_at.
(`last_discovered_at` drives the weekly SERP discovery cadence.)

### 14.5 scrape_jobs
id, project_id, status, job_type, started_at, finished_at, error_message, created_at.
Job type: daily, manual. Status: pending, running, completed, failed.

### 14.6 sources
id, project_id, competitor_id (nullable), keyword_id (nullable), title, url, domain, source_type, scraped_at, content_snippet, cleaned_text, r2_raw_html_key (nullable), created_at.
Unique constraint: `(project_id, url)`.

### 14.7 signals
id, project_id, title, category, description, importance, confidence_score, suggested_action, created_at.

### 14.8 signal_sources
id, signal_id, source_id, created_at.

### 14.9 daily_summaries
id, project_id, summary_date, summary_text, created_at, updated_at.
Unique constraint: `(project_id, summary_date)`.

### 14.10 daily_summary_sources
id, daily_summary_id, source_id, created_at.

### 14.11 usage_counters
Tracks per-cycle API usage for budget enforcement (section 21.3).
id, user_id, period_start, serp_calls, scrape_calls, sources_stored, signals_generated, updated_at.
Unique constraint: `(user_id, period_start)`.

### 14.12 Indexes
* `sources (project_id)`, `sources (project_id, scraped_at)`
* `signals (project_id, created_at)`
* `daily_summaries (project_id, summary_date)` (covered by unique constraint)
* `competitors (project_id)`, `keywords (project_id)`
* `scrape_jobs (project_id, created_at)`
* `usage_counters (user_id, period_start)` (covered by unique constraint)

All foreign keys to `projects` use `ON DELETE CASCADE` so deleting a project removes its child rows (section 23).

## 15. API Routes

### 15.1 Projects
* `POST /api/projects` — create a project (runs lazy user upsert first; enforces plan project limit).
* `GET /api/projects` — get user projects.
* `GET /api/projects/:id` — get project details.
* `PATCH /api/projects/:id` — update project, including the company profile fields (`company_website`, `company_description`, `company_logo_url`, `company_socials`, `track_company`).
* `DELETE /api/projects/:id` — delete project (cascades to all project data, section 23).

### 15.2 Competitors
* `POST /api/projects/:id/competitors` — add competitor (enforces per-project plan limit). Accepts a minimum body of `{ website_url }`; the confirmed enriched fields (`name`, `description`, `logo_url`, `socials`) may also be sent from the confirm screen (section 13.11).
* `PATCH /api/competitors/:id` — update competitor (`name`, `website_url`, `notes`, `description`, `logo_url`, `socials`, `is_active`).
* `DELETE /api/competitors/:id` — remove competitor.

### 15.3 Keywords
* `POST /api/projects/:id/keywords` — add keyword (enforces per-project plan limit).
* `PATCH /api/keywords/:id` — update keyword (`keyword` text, `is_active`).
* `DELETE /api/keywords/:id` — remove keyword.

### 15.4 Scraping
* `POST /api/projects/:id/refresh` — manual refresh. Rules: user must own project; per-hour floor + daily plan quota (section 21); runs the per-project worker path; consumes call budget; creates a `scrape_jobs` record.
* `POST /api/cron/daily-scrape` — cron **dispatcher**. Protected by `CRON_SECRET`. Enumerates active projects and triggers workers. Does no work itself.
* `POST /api/internal/process-project` — per-project worker. Protected by an internal secret. High `maxDuration`. Runs discovery → scrape → AI → summary for one project. Called by both the dispatcher and manual refresh.
* `POST /api/cron/cleanup` — retention cleanup (section 23). Protected by `CRON_SECRET`.

### 15.5 Signals
* `GET /api/projects/:id/signals` — get latest signals.
* `GET /api/signals/:id/sources` — get sources attached to a signal.

### 15.6 Daily Summary
* `GET /api/projects/:id/daily-summary` — get today's daily summary.

### 15.7 Sources
* `GET /api/projects/:id/sources` — get project sources (supports filters: source type, competitor, keyword, date).

### 15.8 Enrichment
* `POST /api/enrich` — body `{ url }`. Fetches the URL via the ScraperAPI standard endpoint and returns a discovered profile as JSON: `{ name, description, logo_url, socials, source_url }`. Used by the onboarding company and competitor confirm screens (sections 12.2, 12.3) and the settings "re-fetch info" action (section 17.5). Validates the URL with Zod, consumes one scrape call from the budget (section 21.3), caches the result briefly, and on failure returns an empty/partial profile so the UI can fall back to manual entry. Ownership is enforced for the authenticated user.

## 16. AI Prompt Requirements

### 16.1 Signal Extraction Prompt

Input: project name; the company profile when present (company name, website, description, social accounts); industry; business type; target market; the competitor list (names, websites, and social accounts where known); keywords; and one or more sources (each with source_id, title, URL, and truncated cleaned text).

Expected JSON output (strict, no prose, no markdown fences):

```json
{
  "signals": [
    {
      "source_id": "the source_id this signal came from",
      "title": "Short signal title",
      "category": "Competitor Move",
      "description": "Short business explanation.",
      "importance": "Medium",
      "confidence_score": 78,
      "suggested_action": "Simple recommended action."
    }
  ]
}
```

Rules: valid JSON only; do not invent information; use only provided source text; keep descriptions short; include `source_id` so each signal maps to a source row; if no useful signal exists, return an empty `signals` array; suggested action should be practical and simple. When a company profile is provided, assess opportunities and risks relative to that company; when it is absent, base everything on competitors and keywords only.

### 16.2 Daily Summary Prompt

Input: project context (including the company profile when present), latest signals, source titles, source snippets, source IDs, source URLs.

Expected JSON output (strict):

```json
{
  "summary_text": "One short paragraph between 80 and 140 words.",
  "source_ids": ["source_id_1", "source_id_2"]
}
```

Rules: valid JSON only; one paragraph; 80–140 words; practical and clear; include one recommended action if possible; no unsupported claims; only attach source IDs that were provided; if there is not enough data, say so clearly.

## 17. UI Pages

### 17.1 Landing Page — `/`
Sections: Hero, Problem, Solution, How it works, Use cases, Pricing, CTA.
Hero headline: "Daily AI market intelligence for your business."
Hero subheadline: "Issuefy monitors competitors, market signals, customer pain points, and business risks from public web sources, then turns them into short daily summaries with clickable sources."
CTA: "Start monitoring"
Pricing block: render the plans from section 21 with a Monthly/Annual toggle defaulting to Annual.
Must follow the provided landing page design from the zip file.

### 17.2 Onboarding Page — `/onboarding`
Steps:
1. **Your company (optional)** — enter the company website, or skip with "Track competitors and keywords only."
2. **Confirm company** — review and edit the auto-discovered basic info and social accounts; confirm project details (project name, industry, business type, target market). If step 1 was skipped, this is a plain business-details form.
3. **Add competitors** — enter a competitor website URL.
4. **Confirm competitor** — review and edit the auto-discovered basic info and social accounts; add another competitor or continue.
5. **Keywords** — add at least three keywords.
6. **Finish.**

Steps 2 and 4 are powered by the enrichment endpoint (sections 13.11, 15.8) and are fully editable, with a manual-entry fallback if nothing is found. Must visually match the provided design system.

### 17.3 Dashboard Page — `/dashboard/:projectId`
Sections: Daily AI Summary, Latest Signals, Competitor Updates, Opportunities, Threats, Recent Sources. Must follow the provided dashboard interface design from the zip file.

### 17.4 Sources Page — `/dashboard/:projectId/sources`
Shows all project sources. Filters: source type, competitor, keyword, date. Use provided table, card, filter, button, badge, and navigation styles if available; otherwise create matching components.

### 17.5 Project Settings Page — `/dashboard/:projectId/settings`
Edit project details and the company profile (website, basic info, social accounts; re-fetch from the website via section 15.8; or remove the company to run on competitors and keywords only). Add, edit (including re-fetching info from the website), and remove competitors and keywords. Use provided form, input, button, card, and layout styles. Show current plan usage against limits (section 21).

## 18. UI Components

Required: ProjectSwitcher, DailySummaryCard, SignalCard, SourceCard, CompetitorList, KeywordList, RefreshButton, EmptyState, LoadingState, ErrorState, PricingTable, UsageMeter, WebsiteEnrichmentForm (URL input plus the editable discovered profile used on onboarding steps 2 and 4), SocialLinksEditor (add/edit/remove social accounts per platform), CompanyProfileCard. CompetitorList and KeywordList must support inline edit and remove (section 17.5).

Rule: use provided components from the zip package first. If a required component does not exist, build a new one matching the existing design system. All icons come from Hugeicons. Do not import shadcn/ui. Do not introduce a separate UI library or a second icon set.

## 19. Empty States

* **No Project:** "Create your first project to start monitoring your market." CTA: "Create Project"
* **No Competitors:** "Add competitor websites to track their updates and market positioning." CTA: "Add Competitor"
* **No Keywords:** "Add keywords to monitor market trends, risks, and customer needs." CTA: "Add Keywords"
* **No Signals Yet:** "Issuefy has not found enough useful market signals yet. Add more competitors or keywords, or run a refresh." CTA: "Refresh Data"

Empty states must visually match the provided design system.

## 20. Permissions

Simple, ownership-based: a user can only access their own projects, sources, signals, and summaries. No team access, no admin dashboard in MVP. Enforce ownership on every API route by joining back to `projects.user_id` for the authenticated Clerk user.

## 21. Pricing, Plans & Usage Limits

Billing (Stripe) is out of MVP scope (section 7); this section defines the plan structure so the product is built with the right limits and metering. The usage limits, API-call budgets, discovery cadence, and cap behavior below are implemented in the MVP for cost control. During beta, apply Starter-equivalent limits to all accounts (`users.plan`) until billing is wired.

Customer-facing limits (projects, sources, refreshes) are derived caps. The **hard cost ceiling is the API-call budget** (section 21.3), because the real variable cost is ScraperAPI calls — a SERP discovery call costs far more than a plain page scrape, and re-scraping the same URL daily is many calls but one stored source.

### 21.1 Plans

| | Starter | Growth | Agency | Enterprise |
|---|---|---|---|---|
| Monthly | $29 | $79 | $199 | Custom |
| Annual (per mo) | $24 | $65 | $165 | Custom |
| Annual total | $288 | $780 | $1,980 | Custom |
| Seats | 1 | 3 | 10 | Custom |
| Projects | 1 | 3 | 10 | Custom |
| Competitors / project | 3 | 5 | 5 | Custom |
| Keywords / project | 15 | 20 | 20 | Custom |
| Sources / month | 300 | 1,500 | 6,000 | Custom |
| AI signals / month | 100 | 500 | 2,000 | Custom |
| Source history | 30 days | 90 days | 180 days | Custom |
| Scheduled scrape | 1/day/project | 1/day/project | 1/day/project | Custom |
| Manual refreshes / day | 1 | 3 | 10 | Custom |
| Source filters | — | Yes | Advanced | Advanced |
| Priority processing | — | Yes | Yes | Yes |
| Client report views | — | — | Yes | Yes |

Competitor and keyword limits are **per project** (and never exceed the technical max of 5 competitors / 20 keywords per project). Sources, AI signals, and refreshes are **account-wide** totals. Annual billing works out to roughly two months free. Enterprise adds custom limits, dedicated support, invoice billing, white-label, and SSO on request.

Positioning: Starter = one company, one market (the wedge). Growth = multiple markets/regions or a small team. Agency = managing several clients/brands. Enterprise = custom volume and white-label.

### 21.2 Free trial

* 14 days, **no credit card required**, Starter-level features.
* Capped trial usage budget (section 21.3) so trials stay cost-safe.
* Trial-ending reminder email via Resend (section 10.11). Converts to a paid plan at the end, or the account pauses.

### 21.3 API-call budgets (the real cost control)

Per billing cycle (monthly), account-wide. Track in `usage_counters` (section 14.11) and enforce in the worker before issuing calls.

| Plan | SERP (discovery) calls | Scrape calls |
|---|---|---|
| Trial (14 days total) | ~30 | ~400 |
| Starter | ~80 | ~1,200 |
| Growth | ~250 | ~4,000 |
| Agency | ~700 | ~12,000 |
| Enterprise | Custom | Custom |

* Discovery is decoupled from monitoring: SERP runs weekly; the daily scrape re-fetches only known URLs (section 10.7).
* The AI signal cap is a fair-use/value limit, not a cost control — the AI layer is cheap (cents to ~$1 per user/month).
* Per-project daily safety rail: at most 50 sources and 20 signals per project per day, so one project cannot drain the monthly budget in a single day.

### 21.4 Behavior when a limit is reached

When the monthly source cap **or** the call budget is hit:

* Keep core competitor scraping running (cheap, high value).
* Pause new keyword discovery (the expensive part) until the next cycle.
* Surface a clear "limit reached — upgrade for more" notice in the dashboard, and send a usage notice via Resend (section 10.11).
* Never keep spending silently after a cap is reached.

## 22. Scraping Rules

Only scrape public web pages. Do not scrape login-protected pages, private user data, payment-protected content, sensitive personal data, or content requiring authentication bypass. Focus on public business information, public competitor websites, public news, public articles, and public industry pages. Drop pages that return empty or near-empty cleaned text (section 13.3).

## 23. Data Retention

* Source history is **plan-based**: 30 days (Starter), 90 days (Growth), 180 days (Agency), custom (Enterprise).
* AI signals: retained 180 days on all plans.
* Daily summaries: kept until project deletion.
* Project deletion: deleting a project deletes all of its competitors, keywords, sources, signals, signal_sources, daily_summaries, daily_summary_sources, and scrape_jobs (use `ON DELETE CASCADE` foreign keys).

Enforcement: a daily `POST /api/cron/cleanup` job (protected by `CRON_SECRET`) deletes sources older than the account's plan window and signals older than 180 days. Retention runs on a schedule.

## 24. Error Handling

* **Scrape failed:** "Some sources could not be checked. Issuefy will try again during the next refresh."
* **No useful signals found:** "No strong market signals were found from the latest sources."
* **AI failed:** "The AI summary could not be generated right now. Please try refreshing later."
* **Manual refresh limit:** "You can refresh this project once per hour." / "You've used all your refreshes for today."
* **Plan limit reached:** "You've reached your plan's monthly limit. Upgrade to keep monitoring."

All failures are also recorded in `scrape_jobs` and reported to Sentry.

## 25. Success Metrics

Track: project created, company profile added, competitor added, competitor auto-enriched, keyword added, daily summary viewed, source clicked, manual refresh used, trial started, trial converted, user returned within 7 days.

Targets: 60% of users create a project; 40% click at least one source; 30% return within one week; at least 5 pilot users say the daily summary is useful.

## 26. Recommended Build Order

### Phase 1: Frontend Foundation
Build the Next.js app (App Router). Import and inspect the provided zip; identify reusable design system components; set up Tailwind per the provided design; install and wire Hugeicons; implement the landing page (including the pricing block, section 21), dashboard layout, and onboarding layout using the provided design. Do not start from shadcn/ui.

### Phase 2: App Foundation
Clerk auth; Neon connection; `/migrations` folder + migration runner; create the schema (section 14, including the company profile fields on `projects` and the enrichment fields on `competitors`) via migrations; lazy user upsert; welcome email via Resend; project creation with the optional company profile; URL-based competitor input; keyword input; `PATCH`/`DELETE` for competitors and keywords (edit and remove); protected dashboard routes; plan-limit checks on create routes.

### Phase 3: Sources
ScraperAPI standard endpoint (URL scraping); ScraperAPI Google Search SDE (keyword discovery); the `/api/enrich` endpoint (section 15.8) reusing the standard endpoint, wired to the onboarding company and competitor confirm screens with editable fields and a manual fallback; the two-stage keyword pipeline with weekly discovery cadence; competitor scraping; content cleaner with the empty-page gate; source upsert with `(project_id, url)` dedup; usage-counter increments; optional R2 raw-HTML archival behind `R2_ENABLED`; show sources in dashboard; clickable links.

### Phase 4: AI Signals
Clean scraped content; truncate; include the company profile (when present) in the AI context so opportunities and risks are assessed relative to the user's company; send to OpenRouter (primary + fallback model); validate response with Zod; store signals; connect signals to sources via `source_id`; show signal cards.

### Phase 5: Daily Summary
Generate the summary with OpenRouter; upsert on `(project_id, summary_date)`; connect to sources; show DailySummaryCard; add View Sources action.

### Phase 6: Automation
Cron dispatcher (`/api/cron/daily-scrape`) + per-project worker (`/api/internal/process-project`) with `waitUntil` fan-out and capped concurrency; weekly discovery scheduling via `keywords.last_discovered_at`; API-call budget enforcement (section 21.3) and cap behavior (section 21.4); usage notices via Resend; scrape job records; manual refresh path reusing the worker, with the per-hour floor and daily plan quota; retention cleanup cron (`/api/cron/cleanup`); error handling; Sentry.

### Phase 7: Polish
Empty states; loading states; settings page with usage meter; source filters; responsive improvements; visual consistency pass against the provided design system.

## 27. Environment Variables

```text
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Neon
DATABASE_URL=

# Cloudflare R2 (optional)
R2_ENABLED=false
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# ScraperAPI
SCRAPERAPI_KEY=

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL_PRIMARY=
OPENROUTER_MODEL_FALLBACK=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Cron / internal
CRON_SECRET=
INTERNAL_WORKER_SECRET=

# Sentry
SENTRY_DSN=
```

## 28. MVP Definition of Done

The MVP is complete when:

* User can sign up and log in; a user row is lazily created on first project creation; a welcome email is sent via Resend.
* User can create a project and add competitors and keywords, within plan limits.
* During onboarding, the user can add a competitor by entering only its website; Issuefy auto-discovers basic info and social accounts, shown for confirmation and fully editable before saving, with a manual fallback if nothing is found.
* The user can optionally provide their company website; Issuefy auto-discovers the company's basic info and social accounts (editable), stores them on the project, and feeds the profile into the AI context. The company step is skippable, and the product runs on competitors and keywords only when it is skipped.
* Competitors and keywords can be edited and removed after onboarding from project settings; the company profile can be edited, re-fetched, or removed.
* The schema is created via migration files.
* Issuefy discovers keyword sources via the ScraperAPI SERP endpoint (weekly cadence) and scrapes them, plus scrapes competitor URLs daily, via the standard endpoint.
* Empty/blocked pages are filtered out.
* Sources are stored with clickable URLs and deduped on `(project_id, url)`; cleaned text is in Neon (raw HTML optionally in R2).
* OpenRouter generates categorized signals (with source attribution) and one daily summary paragraph, both Zod-validated.
* The dashboard shows the daily summary, signals, and recent sources.
* Every signal has at least one source; the daily summary has clickable related sources.
* Manual refresh runs the per-project worker within the per-hour floor and daily plan quota, and regenerates today's summary.
* The daily cron dispatcher fans out per-project workers; one failed project does not stop others.
* API-call budgets and the limit-reached behavior (sections 21.3–21.4) are enforced, with usage tracked in `usage_counters`.
* Source retention runs daily per the plan window.
* Errors are tracked in `scrape_jobs` and Sentry.
* The frontend uses the provided design system and components; all icons are Hugeicons; the landing page shows the pricing block; no shadcn/ui; any missing components match the provided design.

## 29. Future Features

Stripe payments and billing, team accounts, agency workspace, white-label reports, email daily/weekly digest, PDF weekly report, PostHog analytics, a real job queue (QStash / Inngest / Trigger.dev), Slack alerts, Google Trends integration, advanced social listening, competitor screenshot history, sentiment charts, source credibility scoring, export to Notion or Google Docs, SSO.

## 30. Final Positioning

Issuefy is not a scraping tool. Issuefy is a daily AI market briefing tool.

"Issuefy monitors public market signals, competitor activity, customer pain points, and business risks, then gives your team a short daily AI briefing with clickable sources."

## 31. Tagline

"Daily market signals. Clear AI summaries. Verified sources."

## 32. Final Instruction for AI Agent

Build Issuefy as a small, clean MVP based on this PRD. Use the user-provided frontend design zip file as the visual source of truth. Do not use shadcn/ui. Do not replace the provided design with a generic SaaS template. Use Hugeicons for all icons. For any missing screens or components, create new ones that match the provided design system.

Pay particular attention to these architecture decisions:

1. Keyword monitoring is **two-stage**: ScraperAPI SERP endpoint for discovery, then standard endpoint for scraping.
2. Discovery is **decoupled** from monitoring: SERP runs weekly; the daily scrape re-fetches only known URLs.
3. The daily cron is a **dispatcher** that fans out a **per-project worker**; it never does all the work in one invocation.
4. The schema is created via **migration files**; there is no ORM.
5. The `users` row is created by a **lazy upsert** from the Clerk session.
6. Sources are **deduped** on `(project_id, url)` via upsert.
7. The daily summary is **upserted** per day and regenerated on manual refresh.
8. Cleaned text lives in **Neon**; R2 is optional and only for raw HTML.
9. Enforce **plan limits and per-cycle API-call budgets** (section 21) with the limit-reached behavior, even before billing is wired — this is the cost control. Track usage in `usage_counters`.
10. Auth emails are handled by **Clerk**; **Resend** sends only product emails (welcome, trial reminder, usage notices).
11. Onboarding is **website-first**: the company and each competitor are added by **URL only** and auto-enriched (basic info + social links) via the standard ScraperAPI endpoint behind `POST /api/enrich`; the discovered profile is always shown for confirmation and is editable, with a manual fallback. The company profile is **optional** (skippable) and, when present, feeds the AI context. Competitors and keywords are editable and removable after onboarding (sections 13.11, 15.8, 17.2, 17.5).

Keep the MVP simple, stable, and focused on project setup, competitor and keyword tracking, public source discovery and scraping, clickable sources, AI signal extraction, one short daily AI summary, and a clean dashboard.
