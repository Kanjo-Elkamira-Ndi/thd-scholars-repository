CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  actor_user_id uuid REFERENCES users (id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
