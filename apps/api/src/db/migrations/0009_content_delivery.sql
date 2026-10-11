ALTER TABLE content_posts
  ADD COLUMN pending_action       text NOT NULL DEFAULT 'none'
      CHECK (pending_action IN ('none', 'publish', 'delete')),
  ADD COLUMN delivery_status      text NOT NULL DEFAULT 'pending'
      CHECK (delivery_status IN ('pending', 'processing', 'posted', 'failed')),
  ADD COLUMN delivery_attempts    integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at      timestamptz,
  ADD COLUMN delivery_claimed_at  timestamptz,
  ADD COLUMN delivery_error       text,
  ADD COLUMN deleted_at           timestamptz,
  ADD COLUMN staged_file_name     text,
  ADD COLUMN staged_mime_type     text,
  ADD COLUMN staged_original_name text;

CREATE INDEX content_posts_delivery_queue
  ON content_posts (next_attempt_at)
  WHERE pending_action <> 'none' AND delivery_status = 'pending';

CREATE INDEX content_posts_delivery_processing
  ON content_posts (delivery_claimed_at)
  WHERE delivery_status = 'processing';

CREATE INDEX content_posts_active
  ON content_posts (created_at DESC)
  WHERE deleted_at IS NULL;

UPDATE settings SET value = '47185920'::jsonb
 WHERE key = 'maxUploadSizeBytes' AND value = '52428800'::jsonb;

INSERT INTO settings (key, value) VALUES ('maxContentUploadBytes', '524288000'::jsonb)
  ON CONFLICT (key) DO NOTHING;
