import { describe, expect, it } from 'vitest';
import { TELEGRAM_CAPTION_MAX_LENGTH } from '@thd/shared';
import { renderContentCaption, renderContentPost } from './content-post';

const base = {
  title: 'The Doctrine of Grace',
  disciplineTag: 'SystematicTheology',
  formatTag: 'ebook',
  cohortTag: 2025 as number | null,
  driveLink: 'https://drive.google.com/file/d/abc/view',
};

describe('renderContentPost', () => {
  it('renders the exact channel copy', () => {
    expect(renderContentPost(base)).toBe(
      [
        '📘 The Doctrine of Grace',
        '',
        'Discipline: #SystematicTheology',
        'Format: #ebook',
        'Cohort: #2025',
        '',
        '🔗 https://drive.google.com/file/d/abc/view',
      ].join('\n'),
    );
  });

  it('omits the cohort line when cohortTag is null', () => {
    const out = renderContentPost({ ...base, cohortTag: null });
    expect(out).not.toContain('Cohort:');
    expect(out).toContain('Format: #ebook');
  });

  it('HTML-escapes the title', () => {
    const out = renderContentPost({ ...base, title: 'A & B <x> "q"' });
    expect(out).toContain('📘 A &amp; B &lt;x&gt; &quot;q&quot;');
  });

  it('drops hashtags that are not in the shared whitelists', () => {
    const out = renderContentPost({ ...base, disciplineTag: 'Nope', formatTag: 'bogus' });
    expect(out).not.toContain('#Nope');
    expect(out).not.toContain('#bogus');
  });

  it('truncates to the Telegram caption limit', () => {
    const out = renderContentPost({ ...base, title: 'x'.repeat(3000) });
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_CAPTION_MAX_LENGTH);
  });
});

describe('renderContentCaption', () => {
  it('drops the drive link line and its preceding blank line', () => {
    expect(renderContentCaption(base)).toBe(
      [
        '📘 The Doctrine of Grace',
        '',
        'Discipline: #SystematicTheology',
        'Format: #ebook',
        'Cohort: #2025',
      ].join('\n'),
    );
  });

  it('truncates to the Telegram caption limit', () => {
    const out = renderContentCaption({ ...base, title: 'x'.repeat(3000), cohortTag: null });
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_CAPTION_MAX_LENGTH);
  });
});
