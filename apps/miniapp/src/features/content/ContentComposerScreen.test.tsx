import { QueryClientProvider } from '@tanstack/react-query';
import type { ContentPost, UserStatusResponse } from '@thd/shared';
import { createContent, getContentPost, getMe, uploadContent } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { createTestQueryClient } from '@/test/render';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentComposerScreen from './ContentComposerScreen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getContentPost: vi.fn(),
    getMe: vi.fn(),
    createContent: vi.fn(),
    updateContent: vi.fn(),
    uploadContent: vi.fn(),
  };
});

vi.mock('@/lib/telegram-actions', () => ({
  setClosingConfirmation: vi.fn(),
  openChannelLink: vi.fn(),
  openExternalLink: vi.fn(),
}));

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

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/content/new" element={<ContentComposerScreen />} />
          <Route path="/content/:id/edit" element={<ContentComposerScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getContentPost).mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(createContent).mockReset();
  vi.mocked(uploadContent).mockReset();
  vi.mocked(getMe).mockResolvedValue(me('faculty', 'owner-1'));
});

describe('ContentComposerScreen', () => {
  it('creates a post from a Drive link', async () => {
    vi.mocked(createContent).mockResolvedValue(post);
    const user = userEvent.setup();
    renderAt('/content/new');

    await user.type(screen.getByLabelText('Title'), 'New lecture');
    await user.click(screen.getByRole('button', { name: /drive link/i }));
    await user.type(screen.getByLabelText('Drive link'), 'https://drive.google.com/file/d/abc');
    await user.click(screen.getByRole('button', { name: /publish post/i }));

    await waitFor(() =>
      expect(vi.mocked(createContent)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New lecture',
          driveLink: 'https://drive.google.com/file/d/abc',
        }),
      ),
    );
  });

  it('reports a network interruption when an upload cannot reach the server', async () => {
    vi.mocked(uploadContent).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'),
    );
    const user = userEvent.setup();
    renderAt('/content/new');

    await user.type(screen.getByLabelText('Title'), 'New lecture');
    await user.upload(
      screen.getByLabelText(/upload audio_lecture file/i),
      new File([new Uint8Array(1)], 'lecture.mp3', { type: 'audio/mpeg' }),
    );
    await user.click(screen.getByRole('button', { name: /publish post/i }));

    expect(
      await screen.findByText(/upload interrupted — check the content list/i),
    ).toBeInTheDocument();
  });

  it('shows AccessDenied when editing another faculty member\u2019s post', async () => {
    vi.mocked(getContentPost).mockResolvedValue(post);
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'not-the-owner'));

    renderAt('/content/c1/edit');

    expect(await screen.findByText(/cannot edit this post/i)).toBeInTheDocument();
  });
});
