import { describe, expect, it } from 'vitest';
import {
  CONTENT_MIME_WHITELIST,
  CONTENT_TITLE_MAX_LENGTH,
  TELEGRAM_MAX_UPLOAD_BYTES,
} from '../constants/content';
import {
  contentCreateMultipartSchema,
  contentCreateSchema,
  contentUpdateSchema,
  driveLinkSchema,
} from './content';
import { completeContentTaskSchema } from './content-tasks';

describe('content schemas', () => {
  it('caps the title at CONTENT_TITLE_MAX_LENGTH', () => {
    const ok = contentCreateSchema.safeParse({
      title: 'a'.repeat(CONTENT_TITLE_MAX_LENGTH),
      disciplineTag: 'BiblicalStudies',
      formatTag: 'ebook',
    });
    expect(ok.success).toBe(true);

    const long = contentCreateSchema.safeParse({
      title: 'a'.repeat(CONTENT_TITLE_MAX_LENGTH + 1),
      disciplineTag: 'BiblicalStudies',
      formatTag: 'ebook',
    });
    expect(long.success).toBe(false);
  });

  it('rejects an unknown discipline tag', () => {
    const result = contentCreateSchema.safeParse({
      title: 'ok',
      disciplineTag: 'NotAThing',
      formatTag: 'ebook',
    });
    expect(result.success).toBe(false);
  });
});

describe('driveLinkSchema', () => {
  it('accepts google drive and docs https links', () => {
    expect(driveLinkSchema.safeParse('https://drive.google.com/file/d/abc/view').success).toBe(
      true,
    );
    expect(driveLinkSchema.safeParse('https://docs.google.com/document/d/abc/edit').success).toBe(
      true,
    );
  });

  it('rejects non-https, foreign hosts, and non-urls', () => {
    expect(driveLinkSchema.safeParse('http://drive.google.com/file/d/abc/view').success).toBe(
      false,
    );
    expect(driveLinkSchema.safeParse('https://evil.example/f.pdf').success).toBe(false);
    expect(driveLinkSchema.safeParse('not-a-url').success).toBe(false);
  });
});

describe('contentCreateMultipartSchema', () => {
  it('coerces cohortYear from a multipart string', () => {
    const parsed = contentCreateMultipartSchema.parse({
      title: 'ok',
      disciplineTag: 'BiblicalStudies',
      formatTag: 'ebook',
      cohortYear: '2025',
    });
    expect(parsed.cohortYear).toBe(2025);
  });
});

describe('contentUpdateSchema', () => {
  it('rejects an empty patch and accepts one field', () => {
    expect(contentUpdateSchema.safeParse({}).success).toBe(false);
    expect(contentUpdateSchema.safeParse({ title: 'x' }).success).toBe(true);
  });
});

describe('completeContentTaskSchema', () => {
  it('requires telegramMessageId when outcome is posted', () => {
    expect(completeContentTaskSchema.safeParse({ outcome: 'posted' }).success).toBe(false);
    expect(
      completeContentTaskSchema.safeParse({ outcome: 'posted', telegramMessageId: 1 }).success,
    ).toBe(true);
    expect(completeContentTaskSchema.safeParse({ outcome: 'deleted' }).success).toBe(true);
  });
});

describe('CONTENT_MIME_WHITELIST', () => {
  it('groups the supported mime types per format', () => {
    expect(CONTENT_MIME_WHITELIST.ebook).toContain('application/pdf');
    expect(CONTENT_MIME_WHITELIST.ebook).toContain('application/epub+zip');
    expect(CONTENT_MIME_WHITELIST.audio_lecture).toContain('audio/mpeg');
    expect(CONTENT_MIME_WHITELIST.video_seminar).toContain('video/mp4');
  });

  it('exposes the telegram 50 MB cap', () => {
    expect(TELEGRAM_MAX_UPLOAD_BYTES).toBe(52428800);
  });
});
