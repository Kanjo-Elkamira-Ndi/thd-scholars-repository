import { CONTENT_FORMATS, DISCIPLINE_TAGS, TELEGRAM_CAPTION_MAX_LENGTH } from '@thd/shared';

export interface ContentPostInput {
  title: string;
  disciplineTag: string;
  formatTag: string;
  cohortTag: number | null;
  driveLink: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const disciplineHashtag = (tag: string): string | null =>
  (DISCIPLINE_TAGS as readonly string[]).includes(tag) ? `#${tag}` : null;

const formatHashtag = (tag: string): string | null =>
  (CONTENT_FORMATS as readonly string[]).includes(tag) ? `#${tag}` : null;

const truncate = (text: string): string =>
  text.length <= TELEGRAM_CAPTION_MAX_LENGTH
    ? text
    : text.slice(0, TELEGRAM_CAPTION_MAX_LENGTH);

const build = (input: ContentPostInput, includeDriveLink: boolean): string => {
  const lines = [`📘 ${escapeHtml(input.title)}`, ''];

  const discipline = disciplineHashtag(input.disciplineTag);
  const format = formatHashtag(input.formatTag);
  if (discipline) lines.push(`Discipline: ${discipline}`);
  if (format) lines.push(`Format: ${format}`);
  if (input.cohortTag !== null) lines.push(`Cohort: #${input.cohortTag}`);

  if (includeDriveLink) {
    lines.push('', `🔗 ${input.driveLink}`);
  }

  return lines.join('\n');
};

export const renderContentPost = (input: ContentPostInput): string => truncate(build(input, true));

export const renderContentCaption = (input: ContentPostInput): string =>
  truncate(build(input, false));
