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
