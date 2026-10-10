import type { UserStatusResponse } from '@thd/shared';

export const renderStatus = ({ user, roster }: UserStatusResponse): string => {
  const lines = [
    'Your status',
    '',
    `Name: ${user.fullName}`,
    `Role: ${user.role}`,
    `Registration: ${roster?.registrationId ?? '—'}`,
    `Roster status: ${roster?.status ?? 'not matched yet'}`,
  ];
  if (roster?.accessReviewPending) {
    lines.push('Access review: pending');
  }
  return lines.join('\n');
};

export const renderNotRegistered = (): string =>
  [
    "You're not registered yet.",
    '',
    'Tap /start to begin, then open the Mini App and complete the registration form.',
  ].join('\n');
