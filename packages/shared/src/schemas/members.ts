import { z } from 'zod';

export const removeMemberSchema = z.object({
  reason: z
    .string({ message: 'Reason must be text' })
    .trim()
    .min(1, { message: 'Reason must not be empty' })
    .max(500, { message: 'Reason must be 500 characters or fewer' })
    .optional(),
});

export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

export const membershipSnapshotSchema = z.object({
  members: z.array(
    z.object({
      telegramId: z
        .number({ message: 'Telegram id must be a number' })
        .int({ message: 'Telegram id must be a whole number' })
        .positive({ message: 'Telegram id must be positive' }),
      isMember: z.boolean({ message: 'isMember must be a boolean' }),
      memberStatus: z
        .string()
        .trim()
        .max(50, { message: 'Member status must be 50 characters or fewer' })
        .nullable()
        .optional()
        .default(null),
    }),
  ),
});

export type MembershipSnapshotInput = z.infer<typeof membershipSnapshotSchema>;

export const memberRemovalConfirmSchema = z
  .object({
    outcome: z.enum(['removed', 'failed']),
    error: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((value) => value.outcome === 'removed' || Boolean(value.error), {
    message: 'error is required when outcome is failed',
  });

export type MemberRemovalConfirmInput = z.infer<typeof memberRemovalConfirmSchema>;
