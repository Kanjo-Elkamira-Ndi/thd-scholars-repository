const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  bytes.every((byte, index) => buffer[index] === byte);

const asciiAt = (buffer: Buffer, offset: number, value: string): boolean =>
  buffer.length >= offset + value.length &&
  buffer.toString('latin1', offset, offset + value.length) === value;

const FTYP_BRANDS: Record<string, string> = {
  'qt  ': 'video/quicktime',
  'M4A ': 'audio/mp4',
  'M4B ': 'audio/mp4',
};

export function detectMime(buffer: Buffer): string | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';

  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return 'application/epub+zip';

  if (asciiAt(buffer, 0, 'RIFF') && asciiAt(buffer, 8, 'WAVE')) return 'audio/wav';

  if (asciiAt(buffer, 0, 'OggS')) return 'audio/ogg';

  if (asciiAt(buffer, 0, 'ID3')) return 'audio/mpeg';

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';

  if (asciiAt(buffer, 4, 'ftyp')) {
    const brand = buffer.toString('latin1', 8, 12);
    return FTYP_BRANDS[brand] ?? 'video/mp4';
  }

  return null;
}
