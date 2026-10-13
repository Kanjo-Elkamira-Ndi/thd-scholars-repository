import { describe, expect, it } from 'vitest';
import { validateSelection, validateUploadFile } from './upload-validation';

function file(name: string, type: string): File {
  return new File([new Uint8Array(1)], name, { type });
}

function sizedFile(type: string, size: number): File {
  const f = file('x', type);
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateSelection', () => {
  it('rejects when both a file and a Drive link are provided', () => {
    expect(validateSelection({ file: file('a.mp3', 'audio/mpeg'), driveLink: 'https://x' })).toMatch(
      /both/i,
    );
  });

  it('rejects when neither is provided', () => {
    expect(validateSelection({ file: null, driveLink: '' })).toMatch(/upload a file|drive link/i);
  });

  it('accepts exactly one source', () => {
    expect(validateSelection({ file: file('a.mp3', 'audio/mpeg'), driveLink: '' })).toBeNull();
    expect(validateSelection({ file: null, driveLink: 'https://drive.google.com/x' })).toBeNull();
  });
});

describe('validateUploadFile', () => {
  it('rejects a MIME type outside the format whitelist', () => {
    expect(validateUploadFile(sizedFile('application/zip', 10), 'audio_lecture')).toMatch(
      /isn't supported|not supported/i,
    );
  });

  it('rejects a file over the size limit', () => {
    expect(validateUploadFile(sizedFile('audio/mpeg', 600 * 1024 * 1024), 'audio_lecture')).toMatch(
      /larger than/i,
    );
  });

  it('accepts a whitelisted, in-limit file', () => {
    expect(validateUploadFile(sizedFile('audio/mpeg', 1024), 'audio_lecture')).toBeNull();
  });
});
