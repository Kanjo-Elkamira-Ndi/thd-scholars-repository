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
  'declarationAccepted',
]);

function readServerErrors(details: unknown): {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
} {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  if (!details || typeof details !== 'object') return { fieldErrors, formErrors };

  const record = details as Record<string, unknown>;
  const rawFieldErrors = record.fieldErrors;
  if (rawFieldErrors && typeof rawFieldErrors === 'object') {
    for (const [field, messages] of Object.entries(rawFieldErrors)) {
      if (Array.isArray(messages) && messages.every((message) => typeof message === 'string')) {
        fieldErrors[field] = messages;
      }
    }
  }
  if (Array.isArray(record.formErrors)) {
    for (const message of record.formErrors) {
      if (typeof message === 'string') formErrors.push(message);
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
          setAlert({
            variant: 'destructive',
            title: 'Registration failed',
            description: error.message,
          });
        }
        return;
      }
      setAlert({
        variant: 'destructive',
        title: 'Something went wrong',
        description: error.message,
      });
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
                    field.onChange(
                      event.target.value === '' ? undefined : Number(event.target.value),
                    )
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
