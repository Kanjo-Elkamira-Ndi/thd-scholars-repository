import type { InlineKeyboardMarkup } from './types';

export const renderStart = (): string =>
  [
    '👋 Welcome to the Th.D. Scholars Bot.',
    '',
    'This bot is the gateway to the DIBI Th.D. community.',
    '',
    'How to get access:',
    '1. Tap Open Registration below.',
    '2. Complete the form with your DIBI Registration ID.',
    "3. We match it against the Registrar's roster.",
    '4. If your record is active, your channel join request is approved automatically.',
    '',
    'Use /help if you get stuck, or /mystatus to check your verification.',
  ].join('\n');

export const startKeyboard = (url: string): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text: 'Open Registration', url }]],
});
