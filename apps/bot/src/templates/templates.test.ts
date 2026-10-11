import { describe, expect, it } from 'vitest';
import type { RosterEntry, User } from '@thd/shared';
import {
  joinRequestPendingKeyboard,
  renderApproval,
  renderDecline,
  renderHelp,
  renderInviteLink,
  renderJoinRequestPending,
  renderNotRegistered,
  renderStart,
  renderStatus,
  startKeyboard,
} from './index';

const user: User = {
  id: 'u1',
  telegramId: 111,
  telegramUsername: 'dev_scholar',
  fullName: 'Dev Scholar',
  email: 'dev@example.com',
  role: 'scholar',
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

const roster = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  id: 'r1',
  userId: 'u1',
  registrationId: 'DIBI-THD-0301',
  cohortYear: 2026,
  programTrack: 'Theology',
  supervisorName: null,
  status: 'active',
  accessReviewPending: false,
  accessReviewFlaggedAt: null,
  updatedBy: null,
  updatedAt: '2026-10-10T00:00:00.000Z',
  createdAt: '2026-10-10T00:00:00.000Z',
  ...over,
});

describe('templates', () => {
  it('start renders the welcome copy', () => {
    expect(renderStart()).toContain('Welcome to the Th.D. Scholars Bot');
  });

  it('start keyboard deep-links to the Mini App URL', () => {
    expect(startKeyboard('https://t.me/x/app')).toEqual({
      inline_keyboard: [[{ text: 'Open Registration', url: 'https://t.me/x/app' }]],
    });
  });

  it('help lists the commands', () => {
    expect(renderHelp()).toContain('/mystatus');
  });

  it('status renders user + roster fields', () => {
    const text = renderStatus({ user, roster: roster() });
    expect(text).toContain('Registration: DIBI-THD-0301');
    expect(text).toContain('Roster status: active');
  });

  it('status renders not-matched and the access-review flag', () => {
    expect(renderStatus({ user, roster: null })).toContain('not matched yet');
    expect(renderStatus({ user, roster: roster({ accessReviewPending: true }) })).toContain(
      'Access review: pending',
    );
  });

  it('not-registered copy points at /start', () => {
    expect(renderNotRegistered()).toContain('/start');
  });

  it('approval and decline render their inputs', () => {
    expect(renderApproval({ name: 'Ada' })).toContain('Ada');
    expect(renderDecline({ reason: 'not on the roster' })).toContain('not on the roster');
  });

  it('join-request-pending renders the exact locked copy', () => {
    expect(renderJoinRequestPending()).toBe(
      [
        'Thanks for requesting to join the Th.D. Scholars channel!',
        '',
        "To be approved, complete your registration in the Mini App. We match your DIBI Registration ID against the Registrar's roster — if your record is active, you'll be approved automatically.",
      ].join('\n'),
    );
  });

  it('join-request-pending keyboard links the Complete Registration button', () => {
    expect(joinRequestPendingKeyboard('https://t.me/x/app')).toEqual({
      inline_keyboard: [[{ text: 'Complete Registration', url: 'https://t.me/x/app' }]],
    });
  });

  it('invite-link renders the exact locked copy', () => {
    expect(
      renderInviteLink({ name: 'Ada', link: 'https://t.me/+abc', expiresInHours: 24 }),
    ).toBe(
      [
        '✅ Welcome, Ada!',
        '',
        'Your registration was approved. Tap the link below to join the Th.D. Scholars channel:',
        '',
        'https://t.me/+abc',
        '',
        'This link works once and expires in 24 hours. If it expires before you use it, run /mystatus or contact the Registrar.',
      ].join('\n'),
    );
  });
});
