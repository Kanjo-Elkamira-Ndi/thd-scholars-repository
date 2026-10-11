import { describe, expect, it } from 'vitest';
import { detectMime } from './file-type';

const ftyp = (brand: string): Buffer =>
  Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from(brand)]);

describe('detectMime', () => {
  it('detects PDF', () => {
    expect(detectMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
  });

  it('detects EPUB (zip container)', () => {
    expect(detectMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('application/epub+zip');
  });

  it('detects WAV', () => {
    expect(detectMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))).toBe(
      'audio/wav',
    );
  });

  it('detects Ogg', () => {
    expect(detectMime(Buffer.from('OggS'))).toBe('audio/ogg');
  });

  it('detects MP3 by ID3 tag', () => {
    expect(detectMime(Buffer.from('ID3\x03\x00'))).toBe('audio/mpeg');
  });

  it('detects MP3 by frame sync', () => {
    expect(detectMime(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe('audio/mpeg');
  });

  it('detects MP4 video', () => {
    expect(detectMime(ftyp('isom'))).toBe('video/mp4');
  });

  it('detects QuickTime video', () => {
    expect(detectMime(ftyp('qt  '))).toBe('video/quicktime');
  });

  it('detects M4A audio', () => {
    expect(detectMime(ftyp('M4A '))).toBe('audio/mp4');
  });

  it('detects WebM', () => {
    expect(detectMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video/webm');
  });

  it('returns null for unknown or text bytes', () => {
    expect(detectMime(Buffer.from('just some plain text'))).toBeNull();
  });

  it('returns null for a too-short buffer', () => {
    expect(detectMime(Buffer.from([0x25]))).toBeNull();
  });
});
