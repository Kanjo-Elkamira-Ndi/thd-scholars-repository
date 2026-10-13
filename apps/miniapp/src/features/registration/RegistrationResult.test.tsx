import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { RegistrationResult } from './RegistrationResult';

afterEach(() => vi.unstubAllEnvs());

describe('RegistrationResult', () => {
  it('celebrates an approval', () => {
    renderWithProviders(
      <RegistrationResult result={{ decision: 'approved', reason: null }} onTryAgain={() => {}} />,
    );
    expect(screen.getByText("You're approved")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();
  });

  it('explains a decline and links the registrar', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', '@thd_registrar');
    renderWithProviders(
      <RegistrationResult
        result={{ decision: 'declined', reason: 'No matching roster entry found' }}
        onTryAgain={() => {}}
      />,
    );
    expect(screen.getByText(/couldn't approve/i)).toBeInTheDocument();
    expect(screen.getByText('No matching roster entry found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@thd_registrar' })).toHaveAttribute(
      'href',
      'https://t.me/thd_registrar',
    );
  });

  it('calls onTryAgain from the decline panel', async () => {
    const onTryAgain = vi.fn();
    renderWithProviders(
      <RegistrationResult
        result={{ decision: 'declined', reason: 'nope' }}
        onTryAgain={onTryAgain}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onTryAgain).toHaveBeenCalledOnce();
  });
});
