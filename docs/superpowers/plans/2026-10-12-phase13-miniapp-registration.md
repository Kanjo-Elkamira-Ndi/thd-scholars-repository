# Mini App Registration Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the registration screen in `apps/miniapp` — a shared-schema-validated form that submits to `POST /api/registrations` and shows an approved/declined result with a registrar contact.

**Architecture:** Mini App only. A `RegistrationScreen` orchestrates three views (`already` / `form` / `result`) off the existing `useMe()` identity query; a self-contained `RegistrationForm` owns react-hook-form validation against the shared zod schema and the submit mutation; result/decline UI are presentational components. Two small, general client changes (`ApiError.details`, `postRegistration`) and one shared constant (`ROLES`) are the only touch-points outside the feature folder.

**Tech Stack:** React 19, TypeScript, react-hook-form + `@hookform/resolvers/zod` + zod (shared), TanStack Query v5, React Router v8, Tailwind v4 tokens, Framer Motion, Vitest + React Testing Library + user-event.

**Spec:** `docs/superpowers/specs/2026-10-12-phase13-miniapp-registration-design.md`

## Global Constraints

- **Do NOT commit.** Repo directive: no commits unless explicitly requested. Every task ends with a **verification** step (lint/typecheck/test) instead of a commit. The final report lists changed files.
- **Prettier config:** `{ singleQuote, semi, trailingComma: 'all', printWidth: 100 }`. Run `npx prettier --write <files>` on new files before the task's verification.
- **No `any`** (`@typescript-eslint/no-explicit-any: error`). Unused vars may be prefixed `_`.
- **Filenames:** lowercase shadcn-style names in `components/ui/*`, PascalCase elsewhere.
- **Commands:** per-workspace `npm run <script> --workspace=apps/miniapp`; root `npm run lint|typecheck|test|build`. Do **not** use root `npx vitest`.
- **Design tokens only** — no ad-hoc hex. Copy from the spec / existing components.
- **Copy must match the spec verbatim** where the spec quotes strings ("You're approved", "We couldn't approve this registration", etc.).
- **Shared schema is the single source of truth** for field rules and messages; do not restate rules inline.
- Client build note: the Vite `>500 kB` chunk warning is pre-existing and out of scope.

---

### Task 1: Shared `ROLES` constant

**Files:**
- Modify: `packages/shared/src/types/enums.ts`
- Modify: `packages/shared/src/schemas/users.ts`
- Test: `packages/shared/src/types/enums.test.ts` (create)

**Interfaces:**
- Produces: `ROLES` — a `readonly` tuple `['scholar', 'faculty', 'registrar', 'admin']`; `Role` remains the union of its members. Consumed by `router/routes.tsx` (Task 8) and `schemas/users.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/types/enums.test.ts
import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from './enums';

describe('ROLES', () => {
  it('lists every role exactly once', () => {
    expect(ROLES).toEqual(['scholar', 'faculty', 'registrar', 'admin']);
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  it('is assignable to Role', () => {
    const roles: readonly Role[] = ROLES;
    expect(roles).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/shared`
Expected: FAIL — `ROLES` is not exported.

- [ ] **Step 3: Add the constant and re-point `users.ts`**

In `packages/shared/src/types/enums.ts`, replace line 1:

```ts
export const ROLES = ['scholar', 'faculty', 'registrar', 'admin'] as const;

export type Role = (typeof ROLES)[number];
```

In `packages/shared/src/schemas/users.ts`, replace the local list:

```ts
import { z } from 'zod';
import { ROLES } from '../types/enums';

export const roleChangeSchema = z.object({
  role: z.enum(ROLES),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test --workspace=packages/shared && npm run typecheck --workspace=packages/shared`
Expected: PASS (existing schema tests still green — `z.enum` accepts the tuple).

---

### Task 2: `ApiError.details` + `postRegistration`

**Files:**
- Modify: `apps/miniapp/src/lib/errors.ts`
- Modify: `apps/miniapp/src/lib/api.ts`
- Test: `apps/miniapp/src/lib/api.test.ts`

**Interfaces:**
- Produces: `ApiError` gains `readonly details?: unknown`; `postRegistration(payload: RegistrationPayload, signal?: AbortSignal): Promise<RegistrationResult>`. Consumed by `RegistrationForm` (Task 6).

- [ ] **Step 1: Write the failing tests**

Append to `apps/miniapp/src/lib/api.test.ts` (keep the existing suite; reuse its fetch stubbing style — inspect the file first and match it). The new assertions:

```ts
import type { RegistrationPayload } from '@thd/shared';
// ...existing imports

it('attaches the error envelope details to ApiError', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payload',
            details: { formErrors: [], fieldErrors: { registrationId: ['bad'] } },
          },
        }),
        { status: 400 },
      ),
    ),
  );

  await expect(apiFetch('/registrations', { method: 'POST' })).rejects.toMatchObject({
    status: 400,
    details: { fieldErrors: { registrationId: ['bad'] } },
  });
});

it('postRegistration posts to /registrations', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ decision: 'approved', reason: null }), { status: 201 }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const payload: RegistrationPayload = {
    fullName: 'Dev Scholar',
    registrationId: 'DIBI-THD-0042',
    cohortYear: 2025,
    email: 'dev@example.com',
    telegramUsername: '@dev_scholar',
    programTrack: 'Theology',
    declarationAccepted: true,
  };

  await expect(postRegistration(payload)).resolves.toEqual({ decision: 'approved', reason: null });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/registrations'),
    expect.objectContaining({ method: 'POST' }),
  );
});
```

Add `postRegistration` to the imports from `@/lib/api` in the test file. Ensure `crypto`/`Response` exist in jsdom — `Response` is global in Node ≥18 and jsdom; if the existing file uses a different stub (e.g. a plain object), mirror that instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/miniapp -- src/lib/api.test.ts`
Expected: FAIL — `details` undefined and `postRegistration` not exported.

- [ ] **Step 3: Implement**

`apps/miniapp/src/lib/errors.ts`:

```ts
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
```

`apps/miniapp/src/lib/api.ts` — widen the envelope and pass `details`:

```ts
interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}
```

```ts
  if (!response.ok) {
    const envelope = await readErrorEnvelope(response);
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? `Request failed with status ${response.status}`,
      envelope?.error?.details,
    );
  }
```

Add the endpoint (and `RegistrationPayload`/`RegistrationResult` to the type import):

```ts
import type { RegistrationPayload, RegistrationResult, UserStatusResponse } from '@thd/shared';
```

```ts
/** Submit a registration. The API replies 201 with the decision and optional reason. */
export function postRegistration(
  payload: RegistrationPayload,
  signal?: AbortSignal,
): Promise<RegistrationResult> {
  return apiFetch<RegistrationResult>('/registrations', { method: 'POST', body: payload, signal });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/miniapp -- src/lib/api.test.ts`
Expected: PASS.

---

### Task 2b: Motion variants

**Files:**
- Modify: `apps/miniapp/src/motion/transitions.ts`

**Interfaces:**
- Produces: `successPop`, `resultVariants` (framer-motion `Variants`), consumed by `SuccessMark` (Task 5) and `RegistrationResult` (Task 7).

- [ ] **Step 1: Add the variants**

```ts
/** The one celebratory moment in the app: an approved registration. */
export const successPop: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: { opacity: 1, scale: 1, transition: springSoft },
};

/** Calm entrance for decision panels (approved and declined). */
export const resultVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: springSoft },
};
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/miniapp`
Expected: PASS (no unused/type errors).

---

### Task 3: Vendored UI primitives (`input`, `label`, `checkbox`, `alert`)

**Files:**
- Create: `apps/miniapp/src/components/ui/input.tsx`
- Create: `apps/miniapp/src/components/ui/label.tsx`
- Create: `apps/miniapp/src/components/ui/checkbox.tsx`
- Create: `apps/miniapp/src/components/ui/alert.tsx`
- Test: `apps/miniapp/src/components/ui/primitives.test.tsx` (create)

**Interfaces:**
- Produces: `Input`, `Label`, `Checkbox`, `Alert` + `AlertTitle` + `AlertDescription` + `alertVariants`. Consumed by Tasks 4/6/7.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/miniapp/src/components/ui/primitives.test.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/miniapp -- src/components/ui/primitives.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the primitives**

`input.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
```

`label.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  );
}
```

`checkbox.tsx` (native input; the ≥44px target comes from the row that wraps it):

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'mt-0.5 size-5 shrink-0 rounded border border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
```

`alert.tsx`:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-card-foreground',
      warning: 'border-warning/40 bg-warning/10 text-foreground',
      destructive: 'border-destructive/40 bg-destructive/10 text-foreground',
      success: 'border-success/40 bg-success/10 text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('font-medium', className)} {...props} />;
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={cn('text-muted-foreground', className)} {...props} />;
}

export { alertVariants };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/miniapp -- src/components/ui/primitives.test.tsx`
Expected: PASS.

---

### Task 4: RHF form primitives (`form.tsx`)

**Files:**
- Create: `apps/miniapp/src/components/ui/form.tsx`
- Test: `apps/miniapp/src/components/ui/form.test.tsx` (create)

**Interfaces:**
- Consumes: `Label` (Task 3), `@radix-ui/react-slot` (existing).
- Produces: `Form` (=`FormProvider`), `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`. Consumed by Task 6.
- Dependency install: `react-hook-form`, `@hookform/resolvers`, `zod` into the miniapp workspace.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install react-hook-form @hookform/resolvers zod --workspace=apps/miniapp
```
Then confirm `apps/miniapp/package.json` lists `react-hook-form`, `@hookform/resolvers`, and `zod`.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/miniapp/src/components/ui/form.test.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Button } from './button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form';
import { Input } from './input';

const schema = z.object({ name: z.string().min(2, { message: 'Name is too short' }) });

function Harness() {
  const form = useForm<z.input<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { name: '' },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}

describe('Form primitives', () => {
  it('labels the control and shows a message on submit', async () => {
    render(<Harness />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is too short')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=apps/miniapp -- src/components/ui/form.test.tsx`
Expected: FAIL — `./form` not found.

- [ ] **Step 4: Implement `form.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { cn } from '@/lib/utils';

export const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

interface FormItemContextValue {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { control } = useFormContext();
  const { touchedFields, isSubmitted, errors } = useFormState({ control });

  if (!fieldContext) throw new Error('useFormField must be used within <FormField>');
  if (!itemContext) throw new Error('useFormField must be used within <FormItem>');

  const { id } = itemContext;
  const error = errors[fieldContext.name];

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    error,
    touched: Boolean(touchedFields[fieldContext.name]) || isSubmitted,
  };
}

export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const id = React.useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('space-y-2', className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const { error, formItemId } = useFormField();
  return (
    <label
      htmlFor={formItemId}
      className={cn(
        'text-sm font-medium leading-none',
        error && 'text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      id={formDescriptionId}
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function FormMessage({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const { error, touched, formMessageId } = useFormField();
  const body = error ? String(error.message ?? '') : children;
  if (!body) return null;
  // Blur-scoped: only show once the field has been touched (or the form was submitted).
  if (!touched) return null;
  return (
    <p
      id={formMessageId}
      role="alert"
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/miniapp -- src/components/ui/form.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck --workspace=apps/miniapp`
Expected: PASS.

---

### Task 5: `SuccessMark`

**Files:**
- Create: `apps/miniapp/src/features/registration/SuccessMark.tsx`
- Test: `apps/miniapp/src/features/registration/SuccessMark.test.tsx` (create)

**Interfaces:**
- Consumes: `successPop` (Task 2b).
- Produces: `SuccessMark` (no props). Consumed by `RegistrationResult` (Task 7).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/miniapp/src/features/registration/SuccessMark.test.tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SuccessMark } from './SuccessMark';

describe('SuccessMark', () => {
  it('renders a check glyph', () => {
    const { container } = render(<SuccessMark />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/SuccessMark.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { successPop } from '@/motion/transitions';

/** Animated approved-registration mark: a springing disc with one soft ring pulse. */
export function SuccessMark() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="relative flex size-20 items-center justify-center">
      {reduceMotion ? null : (
        <motion.span
          initial={{ opacity: 0.35, scale: 0.7 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full bg-success/30"
        />
      )}
      <motion.span
        variants={successPop}
        initial="hidden"
        animate="visible"
        className="flex size-16 items-center justify-center rounded-full bg-success text-success-foreground"
      >
        <Check className="size-8" strokeWidth={3} aria-hidden="true" />
      </motion.span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/SuccessMark.test.tsx`
Expected: PASS.

---

### Task 6: `RegistrationForm`

**Files:**
- Create: `apps/miniapp/src/features/registration/RegistrationForm.tsx`
- Test: `apps/miniapp/src/features/registration/RegistrationForm.test.tsx` (create)

**Interfaces:**
- Consumes: `Form*`/`useFormField` (Task 4), `Input`/`Checkbox`/`Alert` (Task 3), `postRegistration` + `ApiError.details` (Task 2), `registrationPayloadSchema` and `RegistrationPayload`/`RegistrationResult` from `@thd/shared`, `UnauthorizedScreen` (existing).
- Produces: `RegistrationForm` with props `{ defaultFullName: string; defaultTelegramUsername: string; onSuccess: (result: RegistrationResult) => void }`. Consumed by Task 8.
- Local refinement: the shared schema is `.extend`-ed **only** to loosen `declarationAccepted` from `literal(true)` to a boolean that must be `true` (so a checkbox can bind to it); every field rule and message still comes from the shared schema.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/miniapp/src/features/registration/RegistrationForm.test.tsx
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
      defaultTelegramUsername="ada"
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
  await user.click(screen.getByLabelText(/declaration/i));
  return user;
}

beforeEach(() => {
  postRegistration.mockReset();
});

describe('RegistrationForm', () => {
  it('prefills name and telegram handle', () => {
    setup();
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText(/telegram username/i)).toHaveValue('ada');
  });

  it('shows the shared message when a field is blurred invalid', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/full name/i));
    await user.clear(screen.getByLabelText(/full name/i));
    await user.tab();
    expect(await screen.findByText('Full name is required')).toBeInTheDocument();
  });

  it('blocks submit without the declaration and never posts', async () => {
    setup();
    await fillValidForm();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/declaration/i)); // untick
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
        telegramUsername: 'ada',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/RegistrationForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `RegistrationForm.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import type { RegistrationPayload, RegistrationResult } from '@thd/shared';
import { registrationPayloadSchema } from '@thd/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UnauthorizedScreen } from '@/components/shared/UnauthorizedScreen';
import { ApiError, postRegistration } from '@/lib/api';

/**
 * The shared schema is the single source of truth for every field rule and
 * message. It is extended only to let a checkbox bind to `declarationAccepted`
 * (the shared schema pins it to `literal(true)`).
 */
const formSchema = registrationPayloadSchema.extend({
  declarationAccepted: z
    .boolean()
    .refine((value) => value === true, { message: 'You must accept the declaration to register' }),
});

type RegistrationFormValues = z.input<typeof formSchema>;

interface RegistrationFormProps {
  defaultFullName: string;
  defaultTelegramUsername: string;
  onSuccess: (result: RegistrationResult) => void;
}

interface FormAlert {
  variant: 'warning' | 'destructive';
  title: string;
  description: string;
}

const FIELD_NAMES = new Set<keyof RegistrationFormValues>([
  'fullName',
  'registrationId',
  'cohortYear',
  'email',
  'telegramUsername',
  'programTrack',
  'supervisorName',
  'declarationAccepted',
]);

function readServerErrors(details: unknown): { fieldErrors: Record<string, string[]>; formErrors: string[] } {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  if (typeof details !== 'object' || details === null) return { fieldErrors, formErrors };

  const record = details as { fieldErrors?: unknown; formErrors?: unknown };
  if (record.fieldErrors && typeof record.fieldErrors === 'object') {
    for (const [key, value] of Object.entries(record.fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        fieldErrors[key] = value as string[];
      }
    }
  }
  if (Array.isArray(record.formErrors)) {
    for (const item of record.formErrors) {
      if (typeof item === 'string') formErrors.push(item);
    }
  }
  return { fieldErrors, formErrors };
}

export function RegistrationForm({
  defaultFullName,
  defaultTelegramUsername,
  onSuccess,
}: RegistrationFormProps) {
  const [alert, setAlert] = useState<FormAlert | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: defaultFullName,
      registrationId: '',
      cohortYear: undefined,
      email: '',
      telegramUsername: defaultTelegramUsername,
      programTrack: '',
      supervisorName: undefined,
      declarationAccepted: false,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    const payload: RegistrationPayload = {
      fullName: values.fullName,
      registrationId: values.registrationId,
      cohortYear: values.cohortYear,
      email: values.email,
      telegramUsername: values.telegramUsername,
      programTrack: values.programTrack,
      declarationAccepted: true,
      ...(values.supervisorName ? { supervisorName: values.supervisorName } : {}),
    };

    try {
      const result = await postRegistration(payload);
      onSuccess(result);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setAlert({
          variant: 'destructive',
          title: 'Something went wrong',
          description: 'Please try again.',
        });
        return;
      }
      if (error.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (error.status === 429) {
        setAlert({
          variant: 'warning',
          title: 'Too many attempts',
          description: 'Please wait a few minutes and try again.',
        });
        return;
      }
      if (error.status === 400) {
        const { fieldErrors, formErrors } = readServerErrors(error.details);
        let mapped = false;
        for (const [field, messages] of Object.entries(fieldErrors)) {
          if (FIELD_NAMES.has(field as keyof RegistrationFormValues) && messages[0]) {
            form.setError(field as keyof RegistrationFormValues, {
              type: 'server',
              message: messages[0],
            });
            mapped = true;
          }
        }
        if (formErrors.length > 0) {
          setAlert({
            variant: 'destructive',
            title: 'Please check your details',
            description: formErrors.join(' '),
          });
        } else if (!mapped) {
          setAlert({ variant: 'destructive', title: 'Registration failed', description: error.message });
        }
        return;
      }
      setAlert({ variant: 'destructive', title: 'Something went wrong', description: error.message });
    }
  });

  if (unauthorized) return <UnauthorizedScreen />;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="registrationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>DIBI registration ID</FormLabel>
              <FormControl>
                <Input autoComplete="off" autoCapitalize="characters" {...field} />
              </FormControl>
              <FormDescription>e.g. DIBI-THD-0042</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cohortYear"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cohort year</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="2025"
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(event.target.value === '' ? undefined : Number(event.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" inputMode="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="telegramUsername"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telegram username</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>Used to reach you on Telegram. Optional leading @.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="programTrack"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Program track</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supervisorName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supervisor (optional)</FormLabel>
              <FormControl>
                <Input
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(event.target.value === '' ? undefined : event.target.value)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="declarationAccepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border border-border bg-card p-3">
              <FormControl>
                <Checkbox
                  name={field.name}
                  ref={field.ref}
                  checked={field.value}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(event.target.checked)}
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel className="font-normal leading-snug">
                  I declare that the information above is accurate and belongs to me.
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        {alert ? (
          <Alert variant={alert.variant}>
            <div>
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </div>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            'Submit registration'
          )}
        </Button>
      </form>
    </Form>
  );
}
```

Note: `ApiError` and `postRegistration` are re-exported from `@/lib/api` (Task 2 / existing `export { ApiError } from './errors'`). If `Loader2` is not exported by this `lucide-react` version, use `LoaderCircle` (same props).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/RegistrationForm.test.tsx`
Expected: PASS. If the `blocks submit without the declaration` test shows sibling errors, confirm `FormMessage`'s `touched` gate is in place (Task 4) — only the declaration message should appear.

- [ ] **Step 5: Verify typecheck + lint**

Run: `npm run typecheck --workspace=apps/miniapp && npm run lint`
Expected: PASS.

---

### Task 7: `AlreadyRegisteredCard`, contact helper, `RegistrationResult`

**Files:**
- Create: `apps/miniapp/src/features/registration/contact.ts`
- Create: `apps/miniapp/src/features/registration/AlreadyRegisteredCard.tsx`
- Create: `apps/miniapp/src/features/registration/RegistrationResult.tsx`
- Test: `apps/miniapp/src/features/registration/RegistrationResult.test.tsx` (create)
- Test: `apps/miniapp/src/features/registration/AlreadyRegisteredCard.test.tsx` (create)
- Test: `apps/miniapp/src/features/registration/contact.test.ts` (create)

**Interfaces:**
- Consumes: `resultVariants` (Task 2b), `SuccessMark` (Task 5), `Card`/`Button`/`StatusPill` (existing), `RosterEntry`/`RegistrationResult` from `@thd/shared`.
- Produces: `getRegistrarContact(): { label: string; href: string } | null`; `AlreadyRegisteredCard` with props `{ roster: RosterEntry; onUpdate: () => void }`; `RegistrationResult` component with props `{ result: RegistrationResult; onTryAgain: () => void }`. Consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/miniapp/src/features/registration/contact.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistrarContact } from './contact';

afterEach(() => vi.unstubAllEnvs());

describe('getRegistrarContact', () => {
  it('returns null when unset', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', '');
    expect(getRegistrarContact()).toBeNull();
  });

  it('builds a t.me link from a handle', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', '@thd_registrar');
    expect(getRegistrarContact()).toEqual({
      label: '@thd_registrar',
      href: 'https://t.me/thd_registrar',
    });
  });

  it('passes through a non-handle value verbatim', () => {
    vi.stubEnv('VITE_REGISTRAR_CONTACT', 'mailto:registrar@thd.example');
    expect(getRegistrarContact()).toEqual({
      label: 'mailto:registrar@thd.example',
      href: 'mailto:registrar@thd.example',
    });
  });
});
```

```tsx
// apps/miniapp/src/features/registration/RegistrationResult.test.tsx
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
```

```tsx
// apps/miniapp/src/features/registration/AlreadyRegisteredCard.test.tsx
import type { RosterEntry } from '@thd/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AlreadyRegisteredCard } from './AlreadyRegisteredCard';

const roster: RosterEntry = {
  id: 'r1',
  userId: 'u1',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  programTrack: 'Theology',
  supervisorName: 'Dr. Bavinck',
  status: 'active',
  accessReviewPending: false,
  accessReviewFlaggedAt: null,
  updatedBy: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AlreadyRegisteredCard', () => {
  it('shows the record and reveals the form on request', async () => {
    const onUpdate = vi.fn();
    renderWithProviders(<AlreadyRegisteredCard roster={roster} onUpdate={onUpdate} />);
    expect(screen.getByText('DIBI-THD-0042')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /update my details/i }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`contact.ts`:

```ts
export interface RegistrarContact {
  label: string;
  href: string;
}

/** Registrar contact from `VITE_REGISTRAR_CONTACT`, or null when unset. */
export function getRegistrarContact(): RegistrarContact | null {
  const raw = (import.meta.env.VITE_REGISTRAR_CONTACT ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('@')) return { label: raw, href: `https://t.me/${raw.slice(1)}` };
  return { label: raw, href: raw };
}
```

`AlreadyRegisteredCard.tsx`:

```tsx
import type { RosterEntry } from '@thd/shared';
import { CheckCircle2 } from 'lucide-react';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AlreadyRegisteredCardProps {
  roster: RosterEntry;
  onUpdate: () => void;
}

export function AlreadyRegisteredCard({ roster, onUpdate }: AlreadyRegisteredCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          You're registered
        </CardTitle>
        <StatusPill status={roster.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Registration ID</dt>
            <dd className="font-medium">{roster.registrationId}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Cohort</dt>
            <dd className="font-medium">{roster.cohortYear}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Track</dt>
            <dd className="text-right font-medium">{roster.programTrack}</dd>
          </div>
        </dl>
        <Button variant="secondary" className="w-full" onClick={onUpdate}>
          Update my details
        </Button>
      </CardContent>
    </Card>
  );
}
```

`RegistrationResult.tsx`:

```tsx
import type { RegistrationResult as RegistrationDecision } from '@thd/shared';
import { motion, useReducedMotion } from 'framer-motion';
import { Home, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { resultVariants } from '@/motion/transitions';
import { getRegistrarContact } from './contact';
import { SuccessMark } from './SuccessMark';

interface RegistrationResultProps {
  result: RegistrationDecision;
  onTryAgain: () => void;
}

export function RegistrationResult({ result, onTryAgain }: RegistrationResultProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const approved = result.decision === 'approved';
  const contact = getRegistrarContact();

  return (
    <motion.div
      variants={resultVariants}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      className="flex flex-col items-center gap-4 text-center"
    >
      {approved ? (
        <SuccessMark />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <UserRound className="size-8" aria-hidden="true" />
        </span>
      )}

      <div className="space-y-2" aria-live="polite">
        <h1 className="text-lg font-semibold">
          {approved ? "You're approved" : "We couldn't approve this registration"}
        </h1>
        {approved ? (
          <p className="text-sm text-muted-foreground">
            Your details are on the roster. The bot is sending your channel invite — check your
            Telegram chats.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This usually means your DIBI Registration ID wasn't found on the Registrar's roster, or
              your record isn't active.
            </p>
            {result.reason ? (
              <Card className="text-left">
                <CardContent className="p-3 text-sm">
                  <span className="text-muted-foreground">Reason: </span>
                  {result.reason}
                </CardContent>
              </Card>
            ) : null}
            {contact ? (
              <p className="text-sm text-muted-foreground">
                Need help? Contact the registrar at{' '}
                <a className="font-medium text-primary underline underline-offset-4" href={contact.href}>
                  {contact.label}
                </a>
                .
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="flex w-full flex-col gap-2">
        {approved ? (
          <Button className="w-full" onClick={() => void navigate('/')}>
            <Home aria-hidden="true" />
            Go to Home
          </Button>
        ) : (
          <>
            <Button className="w-full" onClick={onTryAgain}>
              Try again
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => void navigate('/')}>
              Back to Home
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/`
Expected: PASS.

---

### Task 8: `RegistrationScreen` + route wiring

**Files:**
- Create: `apps/miniapp/src/features/registration/RegistrationScreen.tsx`
- Test: `apps/miniapp/src/features/registration/RegistrationScreen.test.tsx` (create)
- Test: `apps/miniapp/src/router/routes.test.ts` (create)
- Modify: `apps/miniapp/src/router/routes.tsx`

**Interfaces:**
- Consumes: `useMe`/`meQueryKey` (existing), `useTelegramUser` (existing), `RegistrationForm` (Task 6), `AlreadyRegisteredCard`/`RegistrationResult` (Task 7), `ROLES` (Task 1), `ScreenSkeleton`/`PageTransition` (existing).
- Produces: `RegistrationScreen` (no props), wired into `routes` at `/registration` with `roles: [...ROLES]`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/miniapp/src/features/registration/RegistrationScreen.test.tsx
import type { UserStatusResponse } from '@thd/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { RegistrationScreen } from './RegistrationScreen';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, getMe: vi.fn(), postRegistration: vi.fn() };
});

const getMe = vi.mocked(api.getMe);

const base: UserStatusResponse = {
  user: {
    id: 'u1',
    telegramId: 1,
    telegramUsername: 'ada',
    fullName: 'Ada Lovelace',
    email: null,
    role: 'scholar',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  roster: null,
};

beforeEach(() => getMe.mockReset());

describe('RegistrationScreen', () => {
  it('shows the form for an unregistered scholar', async () => {
    getMe.mockResolvedValue(base);
    renderWithProviders(<RegistrationScreen />);
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
  });

  it('shows the already-registered card for an active scholar', async () => {
    getMe.mockResolvedValue({
      ...base,
      roster: {
        id: 'r1',
        userId: 'u1',
        registrationId: 'DIBI-THD-0042',
        cohortYear: 2025,
        programTrack: 'Theology',
        supervisorName: null,
        status: 'active',
        accessReviewPending: false,
        accessReviewFlaggedAt: null,
        updatedBy: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    renderWithProviders(<RegistrationScreen />);
    expect(await screen.findByText(/you're registered/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/cohort year/i)).not.toBeInTheDocument();
  });
});
```

```ts
// apps/miniapp/src/router/routes.test.ts
import { describe, expect, it } from 'vitest';
import { ROLES } from '@thd/shared';
import { routeByPath } from './routes';

describe('registration route', () => {
  it('is open to every role and hidden from the tab bar', () => {
    const route = routeByPath('/registration');
    expect(route?.showInNav).toBe(false);
    expect(route?.roles).toEqual(expect.arrayContaining([...ROLES]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/RegistrationScreen.test.tsx src/router/routes.test.ts`
Expected: FAIL — `RegistrationScreen` not found; route has no `roles` yet.

- [ ] **Step 3: Implement `RegistrationScreen.tsx`**

```tsx
import type { RegistrationResult } from '@thd/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageTransition } from '@/components/shared/PageTransition';
import { ScreenSkeleton } from '@/components/shared/LoadingSkeletons';
import { meQueryKey, useMe } from '@/hooks/use-me';
import { useTelegramUser } from '@/hooks/use-telegram';
import { AlreadyRegisteredCard } from './AlreadyRegisteredCard';
import { RegistrationForm } from './RegistrationForm';
import { RegistrationResult as RegistrationResultPanel } from './RegistrationResult';

export function RegistrationScreen() {
  const { data } = useMe();
  const telegramUser = useTelegramUser();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [showFormForActive, setShowFormForActive] = useState(false);

  if (!data) return <ScreenSkeleton />;

  const defaultTelegramUsername = data.user.telegramUsername ?? telegramUser?.username ?? '';

  if (result) {
    return <RegistrationResultPanel result={result} onTryAgain={() => setResult(null)} />;
  }

  if (data.roster?.status === 'active' && !showFormForActive) {
    return <AlreadyRegisteredCard roster={data.roster} onUpdate={() => setShowFormForActive(true)} />;
  }

  return (
    <PageTransition>
      <RegistrationForm
        defaultFullName={data.user.fullName}
        defaultTelegramUsername={defaultTelegramUsername}
        onSuccess={(next) => {
          setResult(next);
          if (next.decision === 'approved') {
            void queryClient.invalidateQueries({ queryKey: meQueryKey });
          }
        }}
      />
    </PageTransition>
  );
}
```

The type `RegistrationResult` and the component of the same name collide, so the component is imported as `RegistrationResultPanel`.

- [ ] **Step 4: Wire the route**

In `apps/miniapp/src/router/routes.tsx`, add the imports:

```tsx
import { ROLES } from '@thd/shared';
import { RegistrationScreen } from '@/features/registration/RegistrationScreen';
```

and replace the `/registration` entry:

```tsx
  {
    path: '/registration',
    label: 'Registration',
    icon: UserCog,
    roles: [...ROLES],
    element: <RegistrationScreen />,
    showInNav: false,
  },
```

`roles` must be a mutable `Role[]`, so spread the readonly `ROLES` tuple. This makes `RequireRole` own the identity loading/401/error states for the route (design D9).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=apps/miniapp -- src/features/registration/RegistrationScreen.test.tsx src/router/routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify typecheck + lint**

Run: `npm run typecheck --workspace=apps/miniapp && npm run lint`
Expected: PASS.

---

### Task 9: Config, docs, and formatting

**Files:**
- Modify: `apps/miniapp/.env.example`
- Modify: `README.md`
- Modify: `docs/context/file-structure.md`

**Interfaces:**
- Produces: the documented `VITE_REGISTRAR_CONTACT` env var and the new file tree entries.

- [ ] **Step 1: Add the env var**

Append to `apps/miniapp/.env.example`:

```bash
# Registrar contact shown on a declined registration — a Telegram @handle,
# mailto:, or tel:. Omit to hide the contact line.
VITE_REGISTRAR_CONTACT=@thd_registrar
```

- [ ] **Step 2: Document it**

In `README.md`, add a `VITE_REGISTRAR_CONTACT` row to the miniapp environment table (match the existing table's format): "Registrar contact (a `@handle`, `mailto:`, or `tel:`) shown when a registration is declined."

- [ ] **Step 3: Update the file tree**

In `docs/context/file-structure.md`, add under the miniapp `features/` listing:

```
features/registration/   RegistrationScreen · RegistrationForm · RegistrationResult ·
                         AlreadyRegisteredCard · SuccessMark · contact
```

and under `components/ui/` add `input · label · checkbox · form · alert`.

- [ ] **Step 4: Format and verify**

Run:
```bash
npx prettier --write "apps/miniapp/src/**/*.{ts,tsx}" apps/miniapp/.env.example README.md docs/context/file-structure.md
npm run lint
```
Expected: PASS (no lint errors).

---

### Task 10: Full verification and narrow-width screenshots

**Files:**
- No source changes (verification only).

- [ ] **Step 1: Format everything new**

Run: `npx prettier --write "apps/miniapp/src/**/*.{ts,tsx}" "packages/shared/src/**/*.ts"`

- [ ] **Step 2: Run the full gates**

Run:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
Expected: lint clean; typecheck clean; tests PASS (all workspaces — the miniapp previously had 25 tests / 5 files; this adds the registration, form, primitives, contact and route suites); `build` succeeds (`build:shared` then all workspaces). The `>500 kB` miniapp chunk warning is pre-existing and acceptable.

- [ ] **Step 2: Capture 375px screenshots (throwaway harness in `/tmp`, not committed)**

1. Mock API (Node `http`, CORS on): respond to `GET /api/me` with a Scholar (`roster: null`, `fullName: 'Ada Lovelace'`, `telegramUsername: 'ada'`) and `POST /api/registrations` with `201 { decision: 'approved', reason: null }` for `DIBI-THD-0042`, else `{ decision: 'declined', reason: 'No matching roster entry found' }`.
2. Build + preview:
   ```bash
   VITE_API_BASE_URL=http://127.0.0.1:3000/api \
   VITE_MOCK_USER='{"id":1,"firstName":"Ada","username":"ada"}' \
   VITE_REGISTRAR_CONTACT='@thd_registrar' \
   npm run build --workspace=apps/miniapp
   npm run preview --workspace=apps/miniapp
   ```
3. Drive headless Chrome over the DevTools Protocol (Node 24 has global `WebSocket`; binary: `/usr/bin/google-chrome`) with device metrics **375×812**; capture PNGs of: the empty form, a validation-error state (blur an empty required field), the declined result, and the approved result. Save to `/tmp/opencode/`.

- [ ] **Step 2b: Report**

Confirm the four screenshots exist with non-trivial file sizes, and include their `/tmp` paths in the final report alongside the `lint`/`typecheck`/`test`/`build` output. Note the screenshots are throwaway (not committed).

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 D1 RHF + shared schema | Task 6 |
| §2 D2 `VITE_REGISTRAR_CONTACT` | Tasks 7, 9 |
| §2 D3 already-registered state | Tasks 7, 8 |
| §2 D4 default ID pattern + server `details` mapping | Tasks 2, 6 |
| §2 D5 vendored primitives | Tasks 3, 4 |
| §2 D6 `ApiError.details` | Task 2 |
| §2 D7 result as client state | Tasks 6, 8 |
| §2 D8 motion | Tasks 2b, 5, 7 |
| §2 D9 role-open route via `ROLES` | Tasks 1, 8 |
| §3 UI/UX rules (blur validation, aria, ≥44px) | Tasks 3, 4, 6 |
| §4 three screen views | Tasks 6, 7, 8 |
| §5 field table + payload assembly | Task 6 |
| §6 error matrix | Task 6 |
| §7 result screens + contact | Task 5, 7 |
| §8 integration changes | Tasks 1, 2, 2b, 8 |
| §9 files & deps | Tasks 3, 4, 6, 7, 8 |
| §10 tests | inline in every task |
| §11 narrow-width verification | Task 10 |
| §12 config & docs | Task 9 |
| §13 deviations | final report |

**Placeholder scan:** no TBD/TODO/"implement later" strings. The one external-API fallback note (Task 6, `Loader2` → `LoaderCircle` if the installed `lucide-react` lacks the former) names a concrete substitute.

**Type consistency:** `RegistrationFormValues` (Task 6) uses `z.input<typeof formSchema>`; `RegistrationPayload`/`RegistrationResult` come from `@thd/shared` and are used identically in Tasks 2, 6, 7, 8. `AlreadyRegisteredCard` prop names (`roster`, `onUpdate`) and `RegistrationResult` prop names (`result`, `onTryAgain`) match the call sites in Task 8. `ROLES` is a readonly tuple; Task 8 spreads it into `AppRoute.roles: Role[]`. The shared type `RegistrationResult` collides with the component of the same name in `RegistrationScreen` (Task 8) — the component is imported as `RegistrationResultPanel` there.
