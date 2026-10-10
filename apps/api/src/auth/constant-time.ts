import { timingSafeEqual } from 'node:crypto';

export const safeEqualBuffers = (a: Buffer, b: Buffer): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

export const safeEqualHex = (a: string, b: string): boolean =>
  safeEqualBuffers(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
