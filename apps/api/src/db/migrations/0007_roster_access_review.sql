ALTER TABLE roster
  ADD COLUMN access_review_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN access_review_flagged_at timestamptz;

CREATE INDEX idx_join_requests_user_created ON join_requests (user_id, created_at);
