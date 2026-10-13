import type { ContentPost, UserStatusResponse } from '@thd/shared';
import { deleteContent, getContentPost, getMe } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentDetailSheet } from './ContentDetailSheet';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getContentPost: vi.fn(),
    getMe: vi.fn(),
    deleteContent: vi.fn(),
  };
});

const post: ContentPost = {
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
};

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
  vi.mocked(getContentPost).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(getContentPost).mockResolvedValue(post);
});

describe('ContentDetailSheet', () => {
  it('hides edit and delete from a non-owner faculty member', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'other-1'));

    renderWithProviders(<ContentDetailSheet postId="c1" open onOpenChange={vi.fn()} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('lets the owner delete a post after confirming', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'owner-1'));
    vi.mocked(deleteContent).mockResolvedValue({ hardDeleted: true });
    const user = userEvent.setup();

    renderWithProviders(<ContentDetailSheet postId="c1" open onOpenChange={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /delete/i }));

    const confirm = await screen.findByRole('dialog', { name: /delete post/i });
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));

    expect(vi.mocked(deleteContent)).toHaveBeenCalledWith('c1');
  });
});
