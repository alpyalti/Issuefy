-- 0009 — Teams, seats & multi-project foundation.
--
-- Adds project_members (the new source of truth for "who can access this
-- project") and project_invitations (pending invites with a UUID token).
-- projects.user_id is kept as the canonical owner pointer; project_members
-- mirrors it (an explicit row for the owner) so JOINs against the new table
-- always work. Owners are backfilled at the bottom of this file.
--
-- Role taxonomy:
--   owner  → pays, full control, manages team & billing
--   editor → full data control (watchlist, signals, project details)
--   viewer → read-only — for stakeholders who shouldn't touch anything

CREATE TABLE IF NOT EXISTS project_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role         text        NOT NULL CHECK (role IN ('owner','editor','viewer')),
  invited_by   uuid                REFERENCES users(id)    ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON project_members (user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members (project_id);

CREATE TABLE IF NOT EXISTS project_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inviter_id   uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  email        text        NOT NULL,
  role         text        NOT NULL CHECK (role IN ('editor','viewer')),
  token        text        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at  timestamptz,
  canceled_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON project_invitations (token);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_project_invitations_project ON project_invitations (project_id);

-- Backfill: every existing project's owner gets an explicit owner-membership row.
-- ON CONFLICT keeps this safe to re-run.
INSERT INTO project_members (project_id, user_id, role)
SELECT id, user_id, 'owner' FROM projects
ON CONFLICT (project_id, user_id) DO NOTHING;
