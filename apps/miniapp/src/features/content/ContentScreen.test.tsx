import type { ContentPost, UserStatusResponse } from '@thd/shared';
import { getContentPost, getMe, listContent } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentScreen from './ContentScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listContent: vi.fn(),
    getContentPost: vi.fn(),
    getMe: vi.fn(),
  };
});

function post(overrides: Partial<ContentPost> = {}): ContentPost {
  return {
    id: 'c1',
    title: 'Hermeneutics 101',
    disciplineTag: 'Hermeneutics',
    formatTag: 'audio_lecture',
    cohortTag: 2025,
    postedBy: 'owner-1',
    telegramMessageId: 42,
    driveLink: null,
    fileSizeBytes: null,
    pendingAction: 'publish',
    deliveryStatus: 'posted',
    deliveryAttempts: 1,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function me(role: UserStatusResponse['user']['role'], id: string): UserStatusResponse {
  return {
    user: {
      id,
      telegramId: 1,
      fullName: 'Someone',
      telegramUsername: null,
      email: null,
      role,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    roster: null,
  };
}

beforeEach(() => {
  vi.mocked(listContent).mockReset();
  vi.mocked(getContentPost).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(listContent).mockResolvedValue({
    items: [post()],
    total: 1,
    page: 1,
    pageSize: 20,
  });
});

describe('ContentScreen', () => {
  it('shows delivery state to an admin', async () => {
    vi.mocked(getMe).mockResolvedValue(me('admin', 'admin-1'));

    renderWithProviders(<ContentScreen />);

    expect(await screen.findByText('Hermeneutics 101')).toBeInTheDocument();
    expect(await screen.findByText('Posted')).toBeInTheDocument();
  });

  it('hides delivery state from a non-owner faculty member', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'other-1'));

    renderWithProviders(<ContentScreen />);

    expect(await screen.findByText('Hermeneutics 101')).toBeInTheDocument();
    expect(screen.queryByText('Posted')).not.toBeInTheDocument();
  });

  it('opens the detail sheet from a card', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'owner-1'));
    vi.mocked(getContentPost).mockResolvedValue(post());
    const user = userEvent.setup();

    renderWithProviders(<ContentScreen />);

    await user.click((await screen.findByText('Hermeneutics 101')).closest('button') as HTMLElement);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(getContentPost).toHaveBeenCalledWith('c1', expect.anything());
  });
});
