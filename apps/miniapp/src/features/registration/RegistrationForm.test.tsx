import type { RegistrationResult } from '@thd/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { RegistrationForm } from './RegistrationForm';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, postRegistration: vi.fn() };
});

const postRegistration = vi.mocked(api.postRegistration);

function setup() {
  const onSuccess = vi.fn<(result: RegistrationResult) => void>();
  renderWithProviders(
    <RegistrationForm
      defaultFullName="Ada Lovelace"
      defaultTelegramUsername="ada_lovelace"
      onSuccess={onSuccess}
    />,
  );
  return { onSuccess };
}

async function fillValidForm() {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/registration id/i));
  await user.type(screen.getByLabelText(/registration id/i), 'DIBI-THD-0042');
  await user.type(screen.getByLabelText(/^cohort year/i), '2025');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/program track/i), 'Theology');
  await user.click(screen.getByLabelText(/i declare/i));
  return user;
}

beforeEach(() => {
  postRegistration.mockReset();
});

describe('RegistrationForm', () => {
  it('prefills name and telegram handle', () => {
    setup();
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText(/telegram username/i)).toHaveValue('ada_lovelace');
  });

  it('shows the shared message when a field is blurred invalid', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/full name/i));
    await user.clear(screen.getByLabelText(/full name/i));
    await user.tab();
    expect(await screen.findByText('Full name must be at least 2 characters')).toBeInTheDocument();
  });

  it('blocks submit without the declaration and never posts', async () => {
    setup();
    await fillValidForm();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/i declare/i)); // untick
    await user.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText(/you must accept the declaration/i)).toBeInTheDocument();
    expect(postRegistration).not.toHaveBeenCalled();
  });

  it('submits the correct payload and reports the result', async () => {
    const { onSuccess } = setup();
    postRegistration.mockResolvedValue({ decision: 'approved', reason: null });
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() =>
      expect(postRegistration).toHaveBeenCalledWith({
        fullName: 'Ada Lovelace',
        registrationId: 'DIBI-THD-0042',
        cohortYear: 2025,
        email: 'ada@example.com',
        telegramUsername: 'ada_lovelace',
        programTrack: 'Theology',
        declarationAccepted: true,
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith({ decision: 'approved', reason: null });
  });

  it('maps 400 field details back onto the field', async () => {
    setup();
    postRegistration.mockRejectedValue(
      new api.ApiError(400, 'VALIDATION_ERROR', 'Invalid payload', {
        formErrors: [],
        fieldErrors: { registrationId: ['Registration ID does not match the required format'] },
      }),
    );
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(
      await screen.findByText('Registration ID does not match the required format'),
    ).toBeInTheDocument();
  });

  it('shows a warning alert when rate limited', async () => {
    setup();
    postRegistration.mockRejectedValue(new api.ApiError(429, 'RATE_LIMITED', 'Slow down'));
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('renders the unauthenticated screen on 401', async () => {
    setup();
    postRegistration.mockRejectedValue(new api.ApiError(401, 'UNAUTHORIZED', 'nope'));
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText(/sign-in required/i)).toBeInTheDocument();
  });
});
