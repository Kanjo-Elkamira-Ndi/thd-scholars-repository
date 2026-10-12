import { z } from 'zod';

export const notificationClaimSchema = z.object({
  limit: z.coerce
    .number()
    .int({ message: 'limit must be a whole number' })
    .min(1, { message: 'limit must be at least 1' })
    .max(100, { message: 'limit must be 100 or fewer' })
    .optional(),
});

export type NotificationClaimInput = z.infer<typeof notificationClaimSchema>;

export const notificationConfirmSchema = z
  .object({
    outcome: z.enum(['sent', 'failed']),
    terminal: z.boolean().optional(),
    error: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((value) => value.outcome === 'sent' || Boolean(value.error), {
    message: 'error is required when outcome is failed',
  });

export type NotificationConfirmInput = z.infer<typeof notificationConfirmSchema>;
