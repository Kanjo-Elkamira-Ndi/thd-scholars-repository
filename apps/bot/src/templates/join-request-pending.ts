import type { InlineKeyboardMarkup } from './types';

export const renderJoinRequestPending = (): string =>
  [
    'Thanks for requesting to join the Th.D. Scholars channel!',
    '',
    "To be approved, complete your registration in the Mini App. We match your DIBI Registration ID against the Registrar's roster — if your record is active, you'll be approved automatically.",
  ].join('\n');

export const joinRequestPendingKeyboard = (url: string): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text: 'Complete Registration', url }]],
});
