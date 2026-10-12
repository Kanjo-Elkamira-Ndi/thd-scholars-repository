import { initData, miniApp, useSignal } from '@telegram-apps/sdk-react';
import { useEffect, useState } from 'react';
import {
  getColorScheme,
  getWebAppUser,
  isTelegramEnvironment,
  type TelegramUser,
} from '@/lib/telegram';

/** The current Telegram user: SDK signal first, raw WebApp object as fallback. */
export function useTelegramUser(): TelegramUser | undefined {
  const signalUser = useSignal(initData.user);
  if (signalUser) return signalUser as TelegramUser;
  return getWebAppUser();
}

/** Reactive colour scheme, driven by Telegram when available, else the OS. */
export function useColorScheme(): 'light' | 'dark' {
  const sdkIsDark = useSignal(miniApp.isDark);
  const [systemIsDark, setSystemIsDark] = useState(() => getColorScheme() === 'dark');

  useEffect(() => {
    if (isTelegramEnvironment()) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemIsDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const isDark = isTelegramEnvironment() ? sdkIsDark : systemIsDark;
  return isDark ? 'dark' : 'light';
}

/** Applies the colour scheme to <html> and returns it. */
export function useTheme(): 'light' | 'dark' {
  const scheme = useColorScheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', scheme === 'dark');
  }, [scheme]);

  return scheme;
}
