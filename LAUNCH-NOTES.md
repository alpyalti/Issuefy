# Issuefy — Launch checklist

Everything that needs APIs, dashboards, or DNS work for production.
All code is committed and pushed to `main`. Vercel will auto-deploy each commit.

---

## 1. Stripe (the biggest pre-launch item)

### A. Get your live keys
1. Stripe Dashboard → **Developers → API keys** → switch to **Live mode** (top right).
2. Reveal `pk_live_…` and `sk_live_…`.

### B. Create the 6 products (one per plan × billing period)
For each plan, create a Product with the right name and **two** Prices (monthly + yearly):

| Product | Monthly | Yearly |
|---|---|---|
| **Starter** | $29 / month | $288 / year |
| **Growth** | $79 / month | $780 / year |
| **Agency** | $199 / month | $1,980 / year |

After each Price is created, copy its `price_…` ID — you'll need six.

### C. Configure the Customer Portal
Stripe Dashboard → **Settings → Billing → Customer portal**.
- **Allowed plan changes:** all six prices, both directions (upgrades + downgrades).
- **Cancellation:** "Cancel at end of billing period" (prorated cancellation off).
- **Invoice history:** enabled.
- **Update payment method:** enabled.
- **Business information** (footer, terms URL): point to your site.

### D. Register the webhook
Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
- **URL:** `https://issuefy.app/api/webhooks/stripe`
- **Events to send:**
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `checkout.session.completed`
- Copy the `whsec_…` signing secret.

### E. Drop these into Vercel
Project Settings → **Environment Variables** (Production only — keep test keys on Preview/Development):

```
STRIPE_SECRET_KEY               sk_live_…
STRIPE_PUBLIC_KEY               pk_live_…
STRIPE_WEBHOOK_SECRET           whsec_…

STRIPE_PRICE_STARTER_MONTHLY    price_…   (from step B)
STRIPE_PRICE_STARTER_ANNUAL     price_…
STRIPE_PRICE_GROWTH_MONTHLY     price_…
STRIPE_PRICE_GROWTH_ANNUAL      price_…
STRIPE_PRICE_AGENCY_MONTHLY     price_…
STRIPE_PRICE_AGENCY_ANNUAL      price_…
```

Then add **one critical flip:**

```
BETA_STARTER_LIMITS             false
```

This switches the app from "every account = Starter" to "respect the plan
Stripe sets". The code is already in place ([lib/usage.ts](lib/usage.ts)) — no
code change needed.

Redeploy after saving env vars.

---

## 2. Clerk — switch to production instance

1. Clerk Dashboard → top dropdown → **Add production instance**.
2. Add `issuefy.app` (and `www.issuefy.app` if you use it) as the Production domain.
3. Clerk gives you a few DNS records (`clerk.issuefy.app`, `clk._domainkey…`, etc.) — paste into your DNS provider. Wait for verify (5–15 min).
4. Reveal `pk_live_…` and `sk_live_…`.
5. Vercel env vars → swap **Production-only** values:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    pk_live_…
   CLERK_SECRET_KEY                     sk_live_…
   ```
   Keep the `pk_test_/sk_test_` values on Preview + Development.

### A note on social providers
The new sign-up form has Google + GitHub OAuth buttons. To enable them:
- **Clerk → User & authentication → Social Connections** → enable Google and GitHub.
- For each, follow Clerk's wizard to create OAuth apps. (Or use Clerk's pre-shared credentials for testing — those work without your own OAuth app.)

---

## 3. Resend — verify your domain

Currently sending from `onboarding@resend.dev`. Real users will not receive any
of the welcome / daily brief / cap-notice / Stripe receipt emails.

1. Resend → **Domains → Add Domain → `issuefy.app`**.
2. Add the DNS records Resend gives you (TXT/MX/DKIM) to your DNS provider. Wait for "Verified".
3. Vercel env vars (Production):
   ```
   RESEND_FROM_EMAIL    Issuefy <hello@issuefy.app>
   ```
   (Or `briefs@`, `noreply@` — your choice.)

---

## 4. Sentry (optional but recommended)

1. Sentry → New project → pick "Next.js".
2. Copy the `https://…@…ingest.sentry.io/…` DSN.
3. Vercel env var: `SENTRY_DSN=<your DSN>`.

The code already calls `captureError` / `captureBreadcrumb` throughout. With
the DSN set, those surface via console logs which Vercel captures. For real
Sentry SDK integration: `npm install @sentry/nextjs` and replace the bodies in
[lib/sentry.ts](lib/sentry.ts) — there's a comment block explaining how.

---

## 5. APP_URL — point at your real domain

Vercel env vars:
- **Production:** `APP_URL=https://issuefy.app`
- **Preview:** leave empty (so each preview deploy uses VERCEL_URL automatically)
- **Development:** `APP_URL=http://localhost:3000`

This is what:
- The cron dispatcher uses to fetch the worker
- Stripe Checkout / Customer Portal use as `success_url` / `return_url`
- Email templates use for the dashboard / unsubscribe links

---

## 6. Cloudflare R2 (already configured, just verify)

R2 archives raw HTML when `R2_ENABLED=true`. Already wired with your
credentials. **Nothing to do** unless you want to disable it (set
`R2_ENABLED=false` and the worker silently skips archival).

---

## 7. Vercel cron (already configured)

[vercel.json](vercel.json) has two cron jobs:
- `0 6 * * *` — daily scrape
- `0 4 * * *` — retention cleanup

Both will fire automatically on your live domain. Verify after first deploy:
**Settings → Cron Jobs** should show both entries.

---

## 8. Custom domain in Vercel

Already done. Verify:
- Vercel → Settings → Domains → `issuefy.app` is primary, `www.issuefy.app` redirects to it (or vice versa).
- HTTPS is auto-issued.

---

## 9. Manual SQL — make yourself an admin

The `users.role` column was added by migration 0006. To grant yourself admin
access to `/admin`, run this against Neon (already done for `k2ralp@gmail.com`):

```sql
UPDATE users SET role = 'admin' WHERE email = 'YOUR_EMAIL';
```

After that, `https://issuefy.app/admin` works for you (404s for everyone else).

---

## 10. Optional — Stripe production-mode test

Before you announce launch:

1. Sign up at `https://issuefy.app/sign-up?plan=growth&billing=annual`
2. Walk through onboarding
3. Stripe Checkout opens → use a **real card** (or `4242 4242 4242 4242` if
   you switch your env to Stripe test mode temporarily)
4. Check Neon: `SELECT email, plan, subscription_status, stripe_customer_id
   FROM users WHERE email = '…'` — should show `growth` + `trialing`
5. Open `/account` → "Manage billing" → Stripe Customer Portal opens
6. Stripe Dashboard → Customers → your test customer is there with the subscription

---

## Quick reference — final env vars on Vercel Production

```
# Already set
APP_URL                              https://issuefy.app
DATABASE_URL                         postgresql://…neon.tech/…
SCRAPERAPI_KEY                       …
OPENROUTER_API_KEY                   sk-or-…
OPENROUTER_MODEL_PRIMARY             google/gemini-2.0-flash-001
OPENROUTER_MODEL_FALLBACK            openai/gpt-4o-mini
RESEND_API_KEY                       re_…
CRON_SECRET                          (32-byte hex)
INTERNAL_WORKER_SECRET               (32-byte hex)
R2_ENABLED                           true
R2_ACCOUNT_ID                        …
R2_ACCESS_KEY_ID                     …
R2_SECRET_ACCESS_KEY                 …
R2_BUCKET                            issuefy

# Update these for production
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    pk_live_…  (was pk_test_)
CLERK_SECRET_KEY                     sk_live_…  (was sk_test_)
RESEND_FROM_EMAIL                    Issuefy <hello@issuefy.app>  (was onboarding@resend.dev)
BETA_STARTER_LIMITS                  false      (was true)

# Add these
STRIPE_SECRET_KEY                    sk_live_…
STRIPE_PUBLIC_KEY                    pk_live_…
STRIPE_WEBHOOK_SECRET                whsec_…
STRIPE_PRICE_STARTER_MONTHLY         price_…
STRIPE_PRICE_STARTER_ANNUAL          price_…
STRIPE_PRICE_GROWTH_MONTHLY          price_…
STRIPE_PRICE_GROWTH_ANNUAL           price_…
STRIPE_PRICE_AGENCY_MONTHLY          price_…
STRIPE_PRICE_AGENCY_ANNUAL           price_…
SENTRY_DSN                           https://…ingest.sentry.io/…  (optional)
```

---

## What I've already done

- All 7 sprints (custom auth, profile, Stripe, admin, prod check, security review, SEO/perf) shipped and pushed to `main`.
- Schema migrations 0005 (Stripe) and 0006 (admin role) applied to Neon.
- Your account (`k2ralp@gmail.com`) elevated to admin in DB.
- Security review documented in [SECURITY-REVIEW.md](SECURITY-REVIEW.md) — no high-confidence vulnerabilities found.
- SEO foundation: metadata, OG image (auto-generated), Twitter card, robots.txt, sitemap.xml, JSON-LD.
- Performance: heavy landing-page canvases lazy-loaded via `next/dynamic`.

## What you still need to do

In priority order:

1. **Stripe** — items 1A–E above (60–90 min)
2. **Clerk live keys** — item 2 above (15 min once DNS verifies)
3. **Resend domain** — item 3 above (10 min + DNS wait)
4. **Flip `BETA_STARTER_LIMITS=false`** — happens during step 1E
5. **Test signup → checkout** — item 10 above (10 min)
6. **Optional: Sentry DSN** — item 4 above (5 min if you want it)

After step 5 succeeds, you are open for business.
