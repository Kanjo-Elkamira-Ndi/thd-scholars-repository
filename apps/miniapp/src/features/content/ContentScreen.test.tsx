import type { ContentPost, UserStatusResponse } from '@thd/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { getContentPost, getMe, listContent } from '@/lib/api';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
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
    expect(await screen.findByText('Posted', { selector: 'span' })).toBeInTheDocument();
  });

  it('hides delivery state from a non-owner faculty member', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'other-1'));

    renderWithProviders(<ContentScreen />);

    expect(await screen.findByText('Hermeneutics 101')).toBeInTheDocument();
    expect(screen.queryByText('Posted', { selector: 'span' })).not.toBeInTheDocument();
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

function renderAt(entry: string) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/content" element={<ContentScreen />} />
          <Route path="/content/:id" element={<ContentScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ContentScreen deep links', () => {
  it('seeds mine and deliveryStatus from the URL', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'owner-1'));

    renderAt('/content?mine=true&deliveryStatus=failed');

    await screen.findByText('Hermeneutics 101');
    expect(listContent).toHaveBeenCalledWith(
      expect.objectContaining({ mine: true, deliveryStatus: 'failed' }),
      expect.anything(),
    );
  });

  it('seeds discipline from the URL', async () => {
    renderAt('/content?discipline=Hermeneutics');

    await screen.findByText('Hermeneutics 101');
    expect(listContent).toHaveBeenCalledWith(
      expect.objectContaining({ discipline: 'Hermeneutics' }),
      expect.anything(),
    );
  });

  it('ignores an unknown deliveryStatus', async () => {
    renderAt('/content?deliveryStatus=bogus');

    await screen.findByText('Hermeneutics 101');
    expect(vi.mocked(listContent).mock.calls[0]?.[0]?.deliveryStatus).toBeUndefined();
  });

  it('applies the Only mine toggle to the request', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'owner-1'));
    const user = userEvent.setup();

    renderAt('/content');

    await user.click(await screen.findByRole('button', { name: 'Only mine' }));

    expect(listContent).toHaveBeenCalledWith(
      expect.objectContaining({ mine: true }),
      expect.anything(),
    );
  });

  it('opens the detail sheet from a /content/:id link', async () => {
    vi.mocked(getMe).mockResolvedValue(me('faculty', 'owner-1'));
    vi.mocked(getContentPost).mockResolvedValue(post());

    renderAt('/content/c1');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(getContentPost).toHaveBeenCalledWith('c1', expect.anything());
  });
});
