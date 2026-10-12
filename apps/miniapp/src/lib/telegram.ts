import { backButton, init, miniApp, themeParams, viewport } from '@telegram-apps/sdk-react';

export interface TelegramUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  photoUrl?: string;
}

export interface MockUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
}

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: TelegramUser };
  colorScheme?: 'light' | 'dark';
  ready?: () => void;
  expand?: () => void;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
}

function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } };
  return scope.Telegram?.WebApp ?? null;
}

/** True when running inside a real Telegram client (or the Telegram test env). */
export function isTelegramEnvironment(): boolean {
  return getWebApp() !== null;
}

/** Raw initData used to authenticate every API call (`Authorization: tma <initData>`). */
export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

export function getColorScheme(): 'light' | 'dark' {
  const webApp = getWebApp();
  if (webApp?.colorScheme === 'dark' || webApp?.colorScheme === 'light') {
    return webApp.colorScheme;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function getWebAppUser(): TelegramUser | undefined {
  return getWebApp()?.initDataUnsafe?.user;
}

/**
 * Dev-only identity, paired with the API's `AUTH_MOCK_ENABLED=true`.
 * Returns null when `VITE_MOCK_USER` is unset or malformed.
 */
export function getMockUser(): MockUser | null {
  const raw = import.meta.env.VITE_MOCK_USER;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MockUser> & { id?: unknown };
    if (typeof parsed.id === 'number') {
      return {
        id: parsed.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        username: parsed.username,
      };
    }
  } catch {
    /* malformed JSON — fall through */
  }
  return null;
}

/** Human display name for a Telegram user. */
export function formatTelegramName(user: TelegramUser | undefined): string {
  if (!user) return '';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.username || String(user.id);
}

/**
 * Initialise the Telegram SDK and mount the scopes the app relies on.
 *
 * No-ops outside Telegram; every step is individually guarded so a single
 * unsupported feature can never blank the app. React reads live state from the
 * SDK's own signals via hooks, not from here.
 */
export function initTelegram(): void {
  if (!isTelegramEnvironment()) return;

  try {
    init();
  } catch {
    return;
  }

  try {
    if (miniApp.isSupported()) miniApp.mount();
  } catch {
    /* noop */
  }
  try {
    themeParams.mount();
  } catch {
    /* noop */
  }
  try {
    viewport.mount();
  } catch {
    /* noop */
  }
  try {
    if (backButton.isSupported()) backButton.mount();
  } catch {
    /* noop */
  }

  try {
    miniApp.ready();
  } catch {
    /* noop */
  }
  try {
    viewport.expand();
  } catch {
    /* noop */
  }

  const webApp = getWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}
