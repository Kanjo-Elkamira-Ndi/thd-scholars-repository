import { describe, expect, it } from 'vitest';
import { escapeHtml, renderNotification, ROLE_LABELS } from './notification';

describe('renderNotification', () => {
  it('whitelists role names for role changes', () => {
    expect(renderNotification({ event: 'role_changed', payload: { from: 'scholar', to: 'faculty' } })).toBe(
      'Your role has been updated to <b>Faculty</b> (previously Scholar).',
    );
    expect(ROLE_LABELS.admin).toBe('Admin');
  });

  it('never interpolates untrusted strings into HTML', () => {
    const out = renderNotification({
      event: 'role_changed',
      payload: { from: '<img src=x onerror=1>', to: 'not-a-role' },
    });
    expect(out).not.toContain('<img');
    expect(out).toContain('a new role');
  });

  it('escapes html in escapeHtml', () => {
    expect(escapeHtml('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; &quot;d&quot;');
  });

  it('renders counts defensively', () => {
    expect(renderNotification({ event: 'audit_flagged', payload: { total: 3 } })).toContain(
      '<b>3</b> records',
    );
    expect(renderNotification({ event: 'audit_flagged', payload: { total: 'x' } })).toContain(
      '<b>0</b> records',
    );
    expect(
      renderNotification({ event: 'access_review_reminder', payload: { count: 1 } }),
    ).toContain('1 scholar still has');
  });

  it('falls back to a generic message for unknown events', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(renderNotification({ event: 'bogus' as any, payload: {} })).toBe(
      'You have a new notification.',
    );
  });
});
