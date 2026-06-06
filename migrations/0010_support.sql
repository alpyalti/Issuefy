-- 0010 — Support ticket management.
--
-- Two tables drive the support flow:
--
--   support_tickets    one row per opened ticket. Always tied to the user who
--                      opened it (cascades on user delete — we don't keep
--                      orphan tickets). Status drives the user/admin lists;
--                      priority is admin-controlled; last_message_at sorts the
--                      admin queue.
--
--   support_messages   thread of messages on a ticket. Each carries
--                      author_type so we can render user vs admin bubbles
--                      without joining back to users.role. The first message
--                      is created in the same transaction as the ticket.

CREATE TABLE IF NOT EXISTS support_tickets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject          text        NOT NULL,
  -- User-picked categories at create time.
  category         text        NOT NULL CHECK (category IN ('bug','feature','billing','account','general')) DEFAULT 'general',
  -- Admin-controlled; default 'normal' on create.
  priority         text        NOT NULL CHECK (priority IN ('low','normal','high','urgent')) DEFAULT 'normal',
  -- open       → user is waiting on an admin reply
  -- pending    → admin replied; awaiting user response
  -- resolved   → admin closed the loop; user can reopen by replying
  -- closed     → permanently archived
  status           text        NOT NULL CHECK (status IN ('open','pending','resolved','closed')) DEFAULT 'open',
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  last_message_by  text        NOT NULL CHECK (last_message_by IN ('user','admin')) DEFAULT 'user',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user           ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_queue    ON support_tickets (status, priority, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_msg       ON support_tickets (last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id     uuid        NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  author_type   text        NOT NULL CHECK (author_type IN ('user','admin')),
  body          text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, created_at ASC);
