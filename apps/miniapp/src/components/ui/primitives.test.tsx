import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Checkbox } from './checkbox';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

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

  it('renders tabs and switches content', async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Alpha tab</TabsTrigger>
          <TabsTrigger value="b">Bravo tab</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Alpha panel</TabsContent>
        <TabsContent value="b">Bravo panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Alpha panel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Bravo tab' }));
    expect(screen.getByText('Bravo panel')).toBeInTheDocument();
  });

  it('renders dialog content when open', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Confirm action</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Confirm action')).toBeInTheDocument();
  });

  it('renders sheet content when open', () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>Sheet details</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Sheet details')).toBeInTheDocument();
  });

  it('renders a select trigger with a placeholder', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Discipline">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
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
