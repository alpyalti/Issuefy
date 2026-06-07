-- 0011 — Keyword translation cache for geo-routed bilingual SERP discovery.
--
-- For non-English target markets, each project keyword is also queried in
-- the local language. We cache the local-language form per (keyword, lang)
-- so the daily scrape only pays the OpenRouter cost once per pair, then hits
-- the cache forever. Keyword strings are normalized at the call site
-- (lowercase, trimmed, whitespace collapsed) before lookup/insert.
--
-- No FK to `keywords` — translations are keyed by the normalized string so a
-- deleted keyword in one project can still serve a future identical keyword
-- in another project, and we avoid project-scoped cache thrash.

CREATE TABLE IF NOT EXISTS keyword_translations (
  keyword     text        NOT NULL,
  lang        text        NOT NULL,   -- ISO 639-1 lowercase, e.g. 'tr','de','fr','es'
  translation text        NOT NULL,
  model_used  text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword, lang)
);
-- PK index is the only index. No secondary indexes — we never query by
-- translation or by created_at.
