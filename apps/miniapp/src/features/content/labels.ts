import type { ContentFormat, DisciplineTag } from '@thd/shared';
import { CONTENT_FORMATS, DISCIPLINE_TAGS } from '@thd/shared';

const DISCIPLINE_LABELS: Record<DisciplineTag, string> = {
  SystematicTheology: 'Systematic Theology',
  BiblicalStudies: 'Biblical Studies',
  HistoricalTheology: 'Historical Theology',
  PracticalTheology: 'Practical Theology',
  Hermeneutics: 'Hermeneutics',
  Missiology: 'Missiology',
  Apologetics: 'Apologetics',
};

const FORMAT_LABELS: Record<ContentFormat, string> = {
  audio_lecture: 'Audio lecture',
  video_seminar: 'Video seminar',
  ebook: 'E-book',
  research_pdf: 'Research paper (PDF)',
};

export function disciplineLabel(tag: string): string {
  return DISCIPLINE_LABELS[tag as keyof typeof DISCIPLINE_LABELS] ?? tag;
}

export function formatLabel(tag: string): string {
  return FORMAT_LABELS[tag as keyof typeof FORMAT_LABELS] ?? tag;
}

/** Filter options for the two enums, with a leading "All" entry. */
export const DISCIPLINE_OPTIONS = [
  { value: '', label: 'All disciplines' },
  ...DISCIPLINE_TAGS.map((tag) => ({ value: tag, label: disciplineLabel(tag) })),
];

export const FORMAT_OPTIONS = [
  { value: '', label: 'All formats' },
  ...CONTENT_FORMATS.map((tag) => ({ value: tag, label: formatLabel(tag) })),
];
