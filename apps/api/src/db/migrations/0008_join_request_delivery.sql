ALTER TABLE join_requests
  ADD COLUMN chat_id bigint,
  ADD COLUMN telegram_user_id bigint,
  ADD COLUMN join_requested_at timestamptz,
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'processing', 'delivered', 'failed')),
  ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN delivery_claimed_at timestamptz,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN delivery_error text;

CREATE UNIQUE INDEX join_requests_one_pending_per_user
  ON join_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX join_requests_delivery_queue
  ON join_requests (next_attempt_at)
  WHERE status <> 'pending' AND delivery_status = 'pending';

CREATE INDEX join_requests_delivery_processing
  ON join_requests (delivery_claimed_at)
  WHERE delivery_status = 'processing';
