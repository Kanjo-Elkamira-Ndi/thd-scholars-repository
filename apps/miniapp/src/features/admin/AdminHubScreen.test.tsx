import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import AdminHubScreen from './AdminHubScreen';

describe('AdminHubScreen', () => {
  it('links to the four admin tools', async () => {
    renderWithProviders(<AdminHubScreen />);

    expect(await screen.findByRole('link', { name: /users & roles/i })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: /members/i })).toHaveAttribute('href', '/admin/members');
    expect(screen.getByRole('link', { name: /audit log/i })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
  });
});
