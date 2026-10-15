import { backButton } from '@telegram-apps/sdk-react';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router';

interface Overlay {
  onBackRef: MutableRefObject<(() => void) | undefined>;
  navigate: (delta: number) => void;
}

const overlays: Overlay[] = [];
let detach: (() => void) | undefined;

/** Only the most recently opened overlay handles Back; otherwise navigate away. */
function runBack(): void {
  const top = overlays[overlays.length - 1];
  if (!top) return;
  const handler = top.onBackRef.current;
  if (handler) handler();
  else top.navigate(-1);
}

function attach(): void {
  if (detach) return;
  if (!backButton.isSupported()) return;
  try {
    if (!backButton.isMounted()) backButton.mount();
    detach = backButton.onClick(runBack);
    backButton.show();
  } catch {
    detach?.();
    detach = undefined;
  }
}

function detachWhenIdle(): void {
  if (overlays.length > 0) return;
  try {
    detach?.();
    backButton.hide();
  } catch {
    /* noop */
  }
  detach = undefined;
}

/**
 * Wire the Telegram Back button for the current screen or overlay.
 *
 * Overlays register a stack: Back closes the top-most open sheet/dialog first,
 * and only navigates to the previous route when nothing is open. No-ops outside
 * Telegram, and `enabled: false` suppresses it entirely.
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

    const entry: Overlay = { onBackRef, navigate };
    overlays.push(entry);
    attach();

    return () => {
      const index = overlays.indexOf(entry);
      if (index !== -1) overlays.splice(index, 1);
      detachWhenIdle();
    };
  }, [enabled, navigate, onBackRef]);
}
