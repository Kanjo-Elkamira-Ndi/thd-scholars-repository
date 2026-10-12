CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  recipient_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'role_changed',
    'member_removal_requested',
    'audit_flagged',
    'access_review_reminder',
    'repeated_registration_failure')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE UNIQUE INDEX notifications_dedupe_unique
  ON notifications (recipient_user_id, dedupe_key);

CREATE INDEX notifications_queue
  ON notifications (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX notifications_processing
  ON notifications (claimed_at)
  WHERE status = 'processing';

CREATE INDEX notifications_recipient
  ON notifications (recipient_user_id);

CREATE TABLE job_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  job         text NOT NULL,
  run_key     text NOT NULL,
  status      text NOT NULL DEFAULT 'started'
                CHECK (status IN ('started', 'completed', 'failed')),
  details     jsonb,
  last_error  text,
  started_at  timestamptz NOT NULL DEFAULT now (),
  finished_at timestamptz
);

CREATE UNIQUE INDEX job_runs_key_unique
  ON job_runs (job, run_key);
