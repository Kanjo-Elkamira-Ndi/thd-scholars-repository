CREATE TABLE channel_membership (
  user_id       uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  is_member     boolean NOT NULL,
  member_status text,
  checked_at    timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE member_removals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id           uuid NOT NULL REFERENCES users (id),
  requested_by      uuid REFERENCES users (id),
  initiated_by_role text NOT NULL
                      CHECK (initiated_by_role IN ('admin', 'registrar')),
  reason            text,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
  delivery_attempts integer NOT NULL DEFAULT 0,
  next_attempt_at   timestamptz,
  claimed_at        timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now (),
  updated_at        timestamptz NOT NULL DEFAULT now (),
  processed_at      timestamptz
);

CREATE UNIQUE INDEX member_removals_open_unique
  ON member_removals (user_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX member_removals_queue
  ON member_removals (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX member_removals_processing
  ON member_removals (claimed_at)
  WHERE status = 'processing';

CREATE INDEX member_removals_user
  ON member_removals (user_id);

ALTER TABLE invite_links
  ADD COLUMN revoked_at timestamptz;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation ()
  RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation ();
