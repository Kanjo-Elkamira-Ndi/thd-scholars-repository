import { backButton } from '@telegram-apps/sdk-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

/**
 * Wire the Telegram Back button for the current screen.
 *
 * With no `onBack`, Back navigates to the previous route. Pass `onBack` to
 * intercept it instead — e.g. an open sheet closes before the route changes.
 * No-ops outside Telegram, and `enabled: false` suppresses it entirely.
 */
export function useBackButton(enabled = true, onBack?: () => void): void {
  const navigate = useNavigate();
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return;
    if (!backButton.isSupported()) return;

    let off: (() => void) | undefined;
    try {
      if (!backButton.isMounted()) backButton.mount();
      off = backButton.onClick(() => {
        if (onBackRef.current) onBackRef.current();
        else navigate(-1);
      });
      backButton.show();
    } catch {
      off?.();
      return;
    }

    return () => {
      try {
        off?.();
        backButton.hide();
      } catch {
        /* noop */
      }
    };
  }, [enabled, navigate]);
}
