import { describe, expect, it } from 'vitest';
import { escapeLike } from './ilike';

describe('escapeLike', () => {
  it('escapes backslashes, percent signs and underscores', () => {
    expect(escapeLike('100%_x\\')).toBe('100\\%\\_x\\\\');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLike('Grace and Truth')).toBe('Grace and Truth');
  });
});
