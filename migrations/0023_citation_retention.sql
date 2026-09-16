-- Durable object cleanup survives source/project/account cascade deletion.
CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  object_key text PRIMARY KEY,
  available_at timestamptz NOT NULL DEFAULT now(),
  cleanup_started_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_cleanup_jobs_due ON storage_cleanup_jobs(available_at);

CREATE OR REPLACE FUNCTION queue_source_archive_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.r2_raw_html_key IS NOT NULL THEN
    IF TG_OP = 'DELETE' OR OLD.r2_raw_html_key IS DISTINCT FROM NEW.r2_raw_html_key THEN
      INSERT INTO storage_cleanup_jobs(object_key) VALUES (OLD.r2_raw_html_key)
      ON CONFLICT (object_key) DO NOTHING;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.r2_raw_html_key IS NOT NULL THEN
    -- Lock the registry entry: once any delete attempt starts this immutable
    -- key can never be reattached (even if the provider outcome is uncertain).
    PERFORM 1 FROM storage_cleanup_jobs WHERE object_key = NEW.r2_raw_html_key FOR UPDATE;
    IF EXISTS (SELECT 1 FROM storage_cleanup_jobs
      WHERE object_key = NEW.r2_raw_html_key AND cleanup_started_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Cannot attach an archive scheduled for deletion';
    END IF;
    DELETE FROM storage_cleanup_jobs WHERE object_key = NEW.r2_raw_html_key;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS source_archive_cleanup ON sources;
CREATE TRIGGER source_archive_cleanup AFTER INSERT OR UPDATE OR DELETE ON sources
FOR EACH ROW EXECUTE FUNCTION queue_source_archive_cleanup();
