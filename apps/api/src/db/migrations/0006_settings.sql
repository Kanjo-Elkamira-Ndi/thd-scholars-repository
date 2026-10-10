CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users (id),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

INSERT INTO settings (key, value) VALUES
  ('registrationIdPattern', to_jsonb ('^DIBI-THD-\d{4}$'::text)),
  ('availableCohortYears', '[2025, 2026]'::jsonb),
  ('inviteLinkExpirySeconds', '86400'::jsonb),
  ('maxUploadSizeBytes', '52428800'::jsonb);
