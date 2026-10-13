import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';

describe('ui primitives', () => {
  it('renders an input wired to a label', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" aria-invalid />
      </>,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('toggles a checkbox', async () => {
    const onChange = vi.fn();
    render(
      <>
        <Label htmlFor="accept">Accept</Label>
        <Checkbox id="accept" onChange={onChange} />
      </>,
    );
    await userEvent.click(screen.getByLabelText('Accept'));
    expect(onChange).toHaveBeenCalled();
  });

  it('renders an alert with title and description', () => {
    render(
      <Alert variant="warning">
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Details</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Heads up');
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
