import {
  disableClosingConfirmation,
  enableClosingConfirmation,
  openLink,
  openTelegramLink,
} from '@telegram-apps/sdk-react';

/**
 * Thin, guarded wrappers over the Telegram SDK's link + closing behavior.
 *
 * Every call no-ops outside Telegram (or when a feature is unsupported) so the
 * feature components never have to branch on the environment themselves.
 */

/** Open a `t.me/…` link (a channel message) in the Telegram in-app browser. */
export function openChannelLink(url: string): void {
  try {
    openTelegramLink(url);
  } catch {
    /* noop */
  }
}

/** Open an external URL (e.g. a Drive link) in the Telegram in-app browser. */
export function openExternalLink(url: string): void {
  try {
    openLink(url);
  } catch {
    /* noop */
  }
}

/** Ask Telegram to confirm before the user closes the Mini App. */
export function setClosingConfirmation(enabled: boolean): void {
  try {
    if (enabled) enableClosingConfirmation();
    else disableClosingConfirmation();
  } catch {
    /* noop */
  }
}
