# Cleaner fixtures

`pricing.html` is synthetic and models navigation, tables, dates and conditions.

Two small **verbatim contiguous HTML excerpts** were retained from direct unauthenticated public HTTPS responses on 2026-09-17:

- `asana-price-excerpt.html`: https://asana.com/pricing — mobile Starter price span and billing paragraph. It does not establish that this late-page content fits the full-page storage cutoff.
- `atlassian-index-excerpt.html`: https://confluence.atlassian.com/cloud/blog — first dated release heading/link. It does not contain the actual release details.

Classes/attributes are retained as received. Full downloads remain uncommitted in `/private/tmp/issuefy-asana-pricing.html` and `/private/tmp/issuefy-atlassian-index.html`; no cookies, authentication, provider calls or private data were used. Tests use these excerpts offline, not live publisher responses.
