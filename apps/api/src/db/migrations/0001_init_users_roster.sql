CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  telegram_id bigint NOT NULL UNIQUE,
  telegram_username text,
  full_name text NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'scholar'
    CHECK (role IN ('scholar', 'faculty', 'registrar', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid REFERENCES users (id),
  registration_id text NOT NULL UNIQUE,
  cohort_year smallint NOT NULL,
  program_track text NOT NULL,
  supervisor_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'graduated', 'withdrawn', 'pending')),
  updated_by uuid REFERENCES users (id),
  updated_at timestamptz NOT NULL DEFAULT now (),
  created_at timestamptz NOT NULL DEFAULT now ()
);
