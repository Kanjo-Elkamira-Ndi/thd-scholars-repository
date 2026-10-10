import { describe, expect, it } from 'vitest';
import type { RosterEntry, User } from '@thd/shared';
import {
  renderApproval,
  renderDecline,
  renderHelp,
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
});
