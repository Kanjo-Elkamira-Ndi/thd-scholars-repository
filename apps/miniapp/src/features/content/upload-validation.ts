import type { ContentFormat } from '@thd/shared';
import { CONTENT_MIME_WHITELIST, DEFAULT_MAX_CONTENT_UPLOAD_BYTES } from '@thd/shared';
import { formatLabel } from './labels';

/** Plain-language validation for the composer's Drive-or-file choice. */

export const MAX_CONTENT_UPLOAD_BYTES = DEFAULT_MAX_CONTENT_UPLOAD_BYTES;

export function validateSelection(input: {
  file: File | null;
  driveLink: string;
}): string | null {
  const { file, driveLink } = input;
  const hasLink = driveLink.trim().length > 0;
  if (file && hasLink) return 'Choose either a file to upload or a Drive link, not both.';
  if (!file && !hasLink) return 'Add a file to upload or paste a Drive link.';
  return null;
}

/** Returns an inline message when a file fails the format's MIME or size rules. */
export function validateUploadFile(
  file: Pick<File, 'type' | 'size'>,
  formatTag: ContentFormat,
  maxBytes: number = DEFAULT_MAX_CONTENT_UPLOAD_BYTES,
): string | null {
  const allowed = CONTENT_MIME_WHITELIST[formatTag];
  if (!allowed.includes(file.type)) {
    return `This file type isn't supported for ${formatLabel(formatTag)}.`;
  }
  if (file.size > maxBytes) {
    const maxMb = Math.floor(maxBytes / (1024 * 1024));
    return `This file is larger than the ${maxMb} MB limit.`;
  }
  return null;
}

export const ACCEPT_ATTRIBUTE = Object.values(CONTENT_MIME_WHITELIST).flat().join(',');
