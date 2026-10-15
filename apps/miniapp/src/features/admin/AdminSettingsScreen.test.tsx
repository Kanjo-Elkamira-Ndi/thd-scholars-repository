import type { SystemSettings } from '@thd/shared';
import { getSettings, updateSettings } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSettingsScreen from './AdminSettingsScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, getSettings: vi.fn(), updateSettings: vi.fn() };
});

function settings(overrides: Partial<SystemSettings> = {}): SystemSettings {
  return {
    registrationIdPattern: '^THD-\\d{4}-\\d{2}$',
    availableCohortYears: [2024, 2025],
    inviteLinkExpirySeconds: 86400,
    maxUploadSizeBytes: 20_971_520,
    maxContentUploadBytes: 536_870_912,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getSettings).mockReset();
  vi.mocked(updateSettings).mockReset();
  vi.mocked(getSettings).mockResolvedValue(settings());
});

describe('AdminSettingsScreen', () => {
  it('seeds the form from the current settings', async () => {
    renderWithProviders(<AdminSettingsScreen />);

    expect(await screen.findByLabelText(/registration id pattern/i)).toHaveValue(
      '^THD-\\d{4}-\\d{2}$',
    );
    expect(screen.getByLabelText(/available cohort years/i)).toHaveValue('2024, 2025');
    expect(screen.getByLabelText(/upload size threshold/i)).toHaveValue(20);
    expect(screen.getByLabelText(/max content upload size/i)).toHaveValue(512);
  });

  it('sends only the fields that changed', async () => {
    vi.mocked(updateSettings).mockResolvedValue(settings({ availableCohortYears: [2025, 2026] }));
    const user = userEvent.setup();

    renderWithProviders(<AdminSettingsScreen />);
    await screen.findByLabelText(/available cohort years/i);

    await user.clear(screen.getByLabelText(/available cohort years/i));
    await user.type(screen.getByLabelText(/available cohort years/i), '2025, 2026');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(updateSettings).toHaveBeenCalledWith({ availableCohortYears: [2025, 2026] });
  });

  it('rejects an empty registration pattern without saving', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AdminSettingsScreen />);
    await screen.findByLabelText(/registration id pattern/i);

    await user.clear(screen.getByLabelText(/registration id pattern/i));
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByText(/must not be empty/i)).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
