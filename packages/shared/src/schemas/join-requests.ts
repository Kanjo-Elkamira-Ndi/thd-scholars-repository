import { z } from 'zod';

export const recordJoinRequestSchema = z.object({
  telegramId: z.number().int().positive(),
  telegramUsername: z.string().trim().min(1).max(64).optional(),
  firstName: z.string().trim().min(1).max(128).optional(),
  lastName: z.string().trim().min(1).max(128).optional(),
  chatId: z.number().int(),
  joinRequestedAt: z.string().min(1),
});

export type RecordJoinRequestInput = z.infer<typeof recordJoinRequestSchema>;

export const claimJoinRequestsSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

export type ClaimJoinRequestsInput = z.infer<typeof claimJoinRequestsSchema>;

const inviteLinkSchema = z.object({
  link: z.string().min(1),
  expiresAt: z.string().min(1),
});

export const completeJoinRequestSchema = z
  .object({
    outcome: z.enum(['delivered', 'failed']),
    error: z.string().max(1000).optional(),
    inviteLink: inviteLinkSchema.optional(),
  })
  .refine((data) => data.outcome !== 'failed' || Boolean(data.error), {
    message: 'error is required when outcome is failed',
    path: ['error'],
  });

export type CompleteJoinRequestInput = z.infer<typeof completeJoinRequestSchema>;
