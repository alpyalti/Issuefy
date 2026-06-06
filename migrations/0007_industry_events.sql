-- 0007 — Industry Event signal category.
--
-- Adds a 9th allowed category so the AI extractor can surface relevant
-- conferences, summits, webinars, and networking events found inside the
-- existing scraped articles. No new sources are added; this is a pure
-- "tell the model to also look for this" change at the prompt layer.
--
-- The original constraint is anonymous (Postgres named it signals_category_check
-- by default — see 0001_init.sql). We drop and re-add by that name to swap it.

ALTER TABLE signals
  DROP CONSTRAINT IF EXISTS signals_category_check;

ALTER TABLE signals
  ADD CONSTRAINT signals_category_check
  CHECK (category IN (
    'Competitor Move',
    'Customer Pain Point',
    'Market Opportunity',
    'Threat / Risk',
    'Trend Signal',
    'Regulation / Policy',
    'Pricing / Offer Change',
    'Service Demand Signal',
    'Industry Event'
  ));
