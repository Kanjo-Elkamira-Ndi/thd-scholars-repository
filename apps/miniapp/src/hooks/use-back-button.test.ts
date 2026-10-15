import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackButton } from './use-back-button';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  offClick: vi.fn(),
  backButton: {
    isSupported: vi.fn(() => true),
    isMounted: vi.fn(() => false),
    mount: vi.fn(),
    onClick: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  },
}));

vi.mock('@telegram-apps/sdk-react', () => ({ backButton: mocks.backButton }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mocks.navigate };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backButton.isSupported.mockReturnValue(true);
  mocks.backButton.isMounted.mockReturnValue(false);
  mocks.backButton.onClick.mockReturnValue(mocks.offClick);
});

describe('useBackButton', () => {
  it('mounts, shows, and hides the button around the screen', () => {
    const { unmount } = renderHook(() => useBackButton());

    expect(mocks.backButton.mount).toHaveBeenCalledTimes(1);
    expect(mocks.backButton.show).toHaveBeenCalledTimes(1);
    expect(mocks.backButton.onClick).toHaveBeenCalledTimes(1);

    const handler = mocks.backButton.onClick.mock.calls[0]?.[0] as () => void;
    handler();
    expect(mocks.navigate).toHaveBeenCalledWith(-1);

    unmount();
    expect(mocks.offClick).toHaveBeenCalled();
    expect(mocks.backButton.hide).toHaveBeenCalled();
  });

  it('runs a custom handler instead of navigating when one is provided', () => {
    const onBack = vi.fn();
    renderHook(() => useBackButton(true, onBack));

    const handler = mocks.backButton.onClick.mock.calls[0]?.[0] as () => void;
    handler();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not interact with the SDK when disabled', () => {
    renderHook(() => useBackButton(false));
    expect(mocks.backButton.onClick).not.toHaveBeenCalled();
    expect(mocks.backButton.show).not.toHaveBeenCalled();
  });

  it('no-ops when the SDK does not support the back button', () => {
    mocks.backButton.isSupported.mockReturnValue(false);
    renderHook(() => useBackButton());
    expect(mocks.backButton.mount).not.toHaveBeenCalled();
    expect(mocks.backButton.show).not.toHaveBeenCalled();
  });

  it('does not re-mount an already mounted button', () => {
    mocks.backButton.isMounted.mockReturnValue(true);
    renderHook(() => useBackButton());
    expect(mocks.backButton.mount).not.toHaveBeenCalled();
    expect(mocks.backButton.show).toHaveBeenCalledTimes(1);
  });

  it('only lets the top-most overlay handle Back', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { unmount: unmountFirst } = renderHook(() => useBackButton(true, first));
    const { unmount: unmountSecond } = renderHook(() => useBackButton(true, second));

    const handler = mocks.backButton.onClick.mock.calls[0]?.[0] as () => void;

    handler();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    unmountSecond();
    handler();
    expect(first).toHaveBeenCalledTimes(1);

    unmountFirst();
  });
});
