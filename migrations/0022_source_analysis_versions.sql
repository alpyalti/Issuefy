-- Additive: apply before deploying version-aware signals. No history is deleted.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS content_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS source_analysis_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content_revision bigint NOT NULL,
  analyzer_version text NOT NULL DEFAULT 'signals-v1',
  title text NOT NULL,
  url text NOT NULL,
  cleaned_text text,
  prior_cleaned_text text,
  last_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  result_signals jsonb,
  result_index integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  expired_at timestamptz,
  UNIQUE(source_id, content_revision, analyzer_version)
);
CREATE INDEX IF NOT EXISTS source_analysis_pending ON source_analysis_versions(project_id, available_at, created_at, id) WHERE completed_at IS NULL AND expired_at IS NULL;
CREATE TABLE IF NOT EXISTS source_signal_fingerprints (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
  PRIMARY KEY(project_id, source_id, fingerprint)
);
CREATE OR REPLACE FUNCTION issuefy_source_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.content_revision := CASE WHEN NEW.cleaned_text IS NULL THEN 0 ELSE 1 END;
  -- Retention may clear text while retaining its hash. Rehydrating that same
  -- hash is not a new revision and must not restart completed/expired analysis.
  ELSIF NEW.cleaned_text IS NOT NULL AND (
    (NEW.content_hash IS NOT NULL AND OLD.content_hash IS NOT NULL AND NEW.content_hash IS DISTINCT FROM OLD.content_hash)
    OR ((NEW.content_hash IS NULL OR OLD.content_hash IS NULL) AND NEW.cleaned_text IS DISTINCT FROM OLD.cleaned_text)
  ) THEN
    NEW.content_revision := OLD.content_revision + 1;
  ELSE
    NEW.content_revision := OLD.content_revision;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS issuefy_source_revision ON sources;
CREATE TRIGGER issuefy_source_revision BEFORE INSERT OR UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION issuefy_source_revision();
CREATE OR REPLACE FUNCTION issuefy_queue_source_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cleaned_text IS NOT NULL AND length(NEW.cleaned_text) >= 200 THEN
    INSERT INTO source_analysis_versions(source_id, project_id, content_revision, title, url, cleaned_text, prior_cleaned_text, last_changed_at, captured_at)
    VALUES (NEW.id, NEW.project_id, NEW.content_revision, NEW.title, NEW.url, left(NEW.cleaned_text,6000), left(NEW.prior_cleaned_text,6000), NEW.last_changed_at, NEW.scraped_at)
    ON CONFLICT(source_id, content_revision, analyzer_version) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS issuefy_queue_source_version ON sources;
CREATE TRIGGER issuefy_queue_source_version AFTER INSERT OR UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION issuefy_queue_source_version();
-- Seed only the current snapshot of existing sources; earlier versions cannot be
-- reconstructed. Existing signal rows are retained and checked during dedup.
INSERT INTO source_analysis_versions(source_id, project_id, content_revision, title, url, cleaned_text, prior_cleaned_text, last_changed_at, created_at, captured_at)
SELECT id, project_id, content_revision, title, url, left(cleaned_text,6000), left(prior_cleaned_text,6000), last_changed_at, created_at, scraped_at
FROM sources WHERE cleaned_text IS NOT NULL AND length(cleaned_text) >= 200
ON CONFLICT(source_id, content_revision, analyzer_version) DO NOTHING;
