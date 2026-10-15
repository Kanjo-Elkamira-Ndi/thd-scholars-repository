import { fireEvent, render, screen, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ConfirmDialog } from './ConfirmDialog';
import { FilterBar } from './FilterBar';
import { ListState } from './ListState';
import { LoadMore } from './LoadMore';
import { SearchInput } from './SearchInput';
import {
  ContentDeliveryPill,
  Pill,
  RosterAuditPill,
  StatusPill,
  contentDeliveryLabel,
  rosterAuditLabel,
  rosterStatusLabel,
} from './StatusPill';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SearchInput', () => {
  it('debounces onChange', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} aria-label="Search scholars" />);

    fireEvent.change(screen.getByLabelText('Search scholars'), { target: { value: 'ada' } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ada');
  });

  it('shows a clear button that resets the query', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} defaultValue="ada" aria-label="Search" />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('FilterBar', () => {
  it('groups its children under a labelled region', () => {
    render(
      <FilterBar>
        <button type="button">Active</button>
        <button type="button">Graduated</button>
      </FilterBar>,
    );
    expect(screen.getByRole('group', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('fires confirm when the primary action is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <MemoryRouter>
        <ConfirmDialog
          open
          onOpenChange={vi.fn()}
          title="Remove member"
          description="This cannot be undone."
          confirmLabel="Remove"
          tone="destructive"
          onConfirm={onConfirm}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Remove member')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without confirming when cancelled', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <ConfirmDialog open onOpenChange={onOpenChange} title="Remove" onConfirm={onConfirm} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('LoadMore', () => {
  it('invokes onLoadMore and reflects the loading state', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<LoadMore onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<LoadMore onLoadMore={onLoadMore} loading />);
    const loadingButton = screen.getByRole('button', { name: 'Loading…' });
    expect(loadingButton).toBeDisabled();
  });
});

describe('ListState', () => {
  it('shows a skeleton while loading', () => {
    render(
      <ListState isLoading isError={false} isEmpty={false}>
        <p>row content</p>
      </ListState>,
    );
    expect(screen.queryByText('row content')).not.toBeInTheDocument();
  });

  it('shows the error state with retry', () => {
    const onRetry = vi.fn();
    render(
      <ListState isLoading={false} isError onRetry={onRetry} isEmpty={false}>
        <p>rows</p>
      </ListState>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty slot when there are no rows', () => {
    render(
      <ListState
        isLoading={false}
        isError={false}
        isEmpty
        empty={<p>No scholars found</p>}
      >
        <p>rows</p>
      </ListState>,
    );
    expect(screen.getByText('No scholars found')).toBeInTheDocument();
  });

  it('renders children when there are rows', () => {
    render(
      <ListState isLoading={false} isError={false} isEmpty={false}>
        <p>row content</p>
      </ListState>,
    );
    expect(screen.getByText('row content')).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('maps labels', () => {
    expect(rosterStatusLabel('graduated')).toBe('Graduated');
    expect(contentDeliveryLabel('posted')).toBe('Posted');
    expect(rosterAuditLabel('active_not_member')).toBe('Active but not in channel');
  });

  it('renders the specialised pills', () => {
    render(
      <div>
        <StatusPill status="active" />
        <ContentDeliveryPill status="posted" />
        <RosterAuditPill issue="membership_unknown" />
        <Pill tone="warning">Custom</Pill>
      </div>,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
    expect(screen.getByText('Membership unknown')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });
});
