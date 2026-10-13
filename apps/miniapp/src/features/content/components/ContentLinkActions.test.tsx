import { openLink, openTelegramLink } from '@telegram-apps/sdk-react';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentLinkActions } from './ContentLinkActions';

vi.mock('@telegram-apps/sdk-react', () => ({
  openTelegramLink: vi.fn(),
  openLink: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv('VITE_CHANNEL_ID', '-1001234567890');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('ContentLinkActions', () => {
  it('opens the channel deep link through the Telegram SDK', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentLinkActions post={{ telegramMessageId: 42, driveLink: null }} />);

    await user.click(screen.getByRole('button', { name: /open in channel/i }));

    expect(openTelegramLink).toHaveBeenCalledWith('https://t.me/c/1234567890/42');
  });

  it('hides the channel action for a link-only post that has not been posted yet', () => {
    renderWithProviders(
      <ContentLinkActions post={{ telegramMessageId: null, driveLink: 'https://drive.google.com/x' }} />,
    );

    expect(screen.queryByRole('button', { name: /open in channel/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open drive link/i })).toBeInTheDocument();
  });

  it('opens a Drive link with openLink (never a new browser tab)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    renderWithProviders(
      <ContentLinkActions post={{ telegramMessageId: null, driveLink: 'https://drive.google.com/x' }} />,
    );

    await user.click(screen.getByRole('button', { name: /open drive link/i }));

    expect(openLink).toHaveBeenCalledWith('https://drive.google.com/x');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('renders nothing when there is no channel or Drive link', () => {
    const { container } = renderWithProviders(
      <ContentLinkActions post={{ telegramMessageId: null, driveLink: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
