import type { ContentFormat, DisciplineTag } from '../types/enums';

export const DISCIPLINE_TAGS = [
  'SystematicTheology',
  'BiblicalStudies',
  'HistoricalTheology',
  'PracticalTheology',
  'Hermeneutics',
  'Missiology',
  'Apologetics',
] as const satisfies readonly DisciplineTag[];

export const CONTENT_FORMATS = [
  'audio_lecture',
  'video_seminar',
  'ebook',
  'research_pdf',
] as const satisfies readonly ContentFormat[];

export const CONTENT_TITLE_MAX_LENGTH = 150;

export const TELEGRAM_CAPTION_MAX_LENGTH = 1024;

export const TELEGRAM_MAX_UPLOAD_BYTES = 52428800;

export const DEFAULT_DRIVE_THRESHOLD_BYTES = 47185920;

export const DEFAULT_MAX_CONTENT_UPLOAD_BYTES = 524288000;

export const CONTENT_MIME_WHITELIST: Record<ContentFormat, readonly string[]> = {
  audio_lecture: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg'],
  video_seminar: ['video/mp4', 'video/quicktime', 'video/webm'],
  ebook: ['application/pdf', 'application/epub+zip'],
  research_pdf: ['application/pdf', 'application/epub+zip'],
};
