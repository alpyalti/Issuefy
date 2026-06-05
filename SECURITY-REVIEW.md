# Security Review — Launch Sprint (Sprints A–D)

## Scope

Commits `b36af32^..bb31bed`:

- **Sprint A** — Custom auth pages (Clerk hooks-based sign-in/sign-up/forgot-password)
- **Sprint B** — `/account` page + profile management API
- **Sprint C** — Stripe Checkout + Customer Portal + webhook
- **Sprint D** — `/admin` panel with role-based access

## Methodology

Agent-driven review using the `/security-review` skill methodology. Focus areas:

- Input validation (SQL injection, command injection, path traversal, template injection)
- Authentication & authorization (bypass, escalation, missing checks)
- Cryptography & secrets (hardcoded keys, signature verification)
- Code execution (deserialization, eval, XSS via `dangerouslySetInnerHTML`)
- Data exposure (PII in logs, debug info)

Particular attention to:

1. Stripe webhook signature verification & idempotency
2. Open redirect via `success_url` / `return_url` on Stripe routes
3. `/api/account` DELETE authorization
4. Admin role-check enforcement and self-revocation guard
5. New SQL queries — parametrization vs interpolation
6. Clerk hook usage — attacker-controlled redirects

## Findings

### No high-confidence vulnerabilities

The agent identified no actionable security findings at confidence ≥ 0.7.

## Verified safe patterns

| Surface | Verified |
|---|---|
| **Stripe webhook signature** | `stripe.webhooks.constructEvent(raw, sig, SECRET)` is used; signature verification happens before any DB write or handler dispatch. Invalid signature → 400. |
| **Stripe webhook idempotency** | Every `event.id` is inserted with `ON CONFLICT (id) DO NOTHING RETURNING id`. Duplicate events short-circuit with 200 OK before handler runs. |
| **Stripe success/cancel URLs** | Built server-side from `APP_URL` env var, not user input — no open redirect. |
| **Stripe Customer Portal `return_url`** | Same — server-controlled from `APP_URL`. |
| **All new SQL queries** | Use Neon's tagged-template parametrization (`sql\`SELECT … WHERE col = ${userValue}\``). No string interpolation into SQL bodies. The `/admin/users` search query uses `${search}::text = '' OR col ILIKE '%' \|\| ${search} \|\| '%'` — both branches are parametrized. |
| **`/api/account` DELETE** | Requires `requireUser()` (auth + lazy upsert). Deletes only by `user.id` (the authenticated user's own row). Cascading FK deletes are intentional per PRD §23. |
| **`/api/admin/*` routes** | All gated by `requireAdminApi()` (or `requireAdmin()` at the layout level for pages). Unauthenticated → 404. Non-admin → 404 (deliberate, not 403, to prevent enumeration). |
| **Admin self-revocation guard** | `PATCH /api/admin/users/[id]/role` rejects with 409 when `id === admin.id && role !== 'admin'`. |
| **Clerk auth callback URLs** | `redirectUrl` and `redirectUrlComplete` in `SocialProviders` are hardcoded literals (`"/sign-in/sso-callback"`, `"/dashboard"`, `"/onboarding"`) — no attacker control. |
| **Plan/billing params from sign-up URL** | Read from `?plan=&billing=` and forwarded to `/api/billing/checkout`. The checkout route validates with `z.enum(["starter","growth","agency"])` × `z.enum(["monthly","annual"])` — malicious values are rejected. |
| **Webhook plan injection** | `session.metadata.plan` is accepted from Stripe but the webhook only runs after signature verification — attackers can't forge sessions. |
| **`stripe_customer_id` ownership** | Created server-side from the authenticated user's email and stored under their `users.id`. Customers cannot be spoofed. |
| **Bearer-secret guards** (cron + worker) | Constant-time compare via `timingSafeEqual()` — pre-existing pattern in `lib/cron-auth.ts`. |
| **CSRF** | Clerk session cookies are `SameSite=Lax` by default. JSON-content-type fetches are not CSRF-vulnerable from cross-site forms. Mutating routes use `PATCH`/`DELETE` methods which require CORS preflight. |
| **No `dangerouslySetInnerHTML`** | None introduced in any new component. |
| **No `eval` / `Function` / dynamic require** | None. |

## Notes / non-security observations

- The webhook handler marks an event as "seen" *before* the handler runs. If the handler errors and returns 500, Stripe will retry — but the next delivery will short-circuit as a duplicate. This is an **availability/correctness** concern, not security. Worth tracking as a future enhancement (move the dedup insert to after successful handling, or move it into the handler's transaction). Out of scope for this security review.
- `customer.subscription.deleted` handler doesn't clear `stripe_subscription_id`. Functional behavior — cosmetic, not security.

## Approval

**No security-blocking issues.** This sprint is safe to ship pending production-environment configuration (Stripe live keys, webhook secret, etc. — see `LAUNCH-NOTES.md` for the operator checklist).
