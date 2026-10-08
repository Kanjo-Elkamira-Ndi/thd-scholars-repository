CREATE TABLE join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES users (id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('approved', 'declined', 'pending')),
  decided_by uuid REFERENCES users (id),
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  link text NOT NULL UNIQUE,
  created_for_user_id uuid NOT NULL REFERENCES users (id),
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now ()
);
