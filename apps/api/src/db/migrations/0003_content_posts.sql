CREATE TABLE content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  title text NOT NULL,
  discipline_tag text NOT NULL,
  format_tag text NOT NULL
    CHECK (format_tag IN ('audio_lecture', 'video_seminar', 'ebook', 'research_pdf')),
  cohort_tag smallint,
  posted_by uuid NOT NULL REFERENCES users (id),
  telegram_message_id bigint,
  drive_link text,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX idx_content_posts_discipline_tag ON content_posts (discipline_tag);
CREATE INDEX idx_content_posts_format_tag ON content_posts (format_tag);
CREATE INDEX idx_content_posts_cohort_tag ON content_posts (cohort_tag);
