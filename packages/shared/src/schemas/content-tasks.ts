import { z } from 'zod';

export const claimContentTasksSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ClaimContentTasksInput = z.infer<typeof claimContentTasksSchema>;

export const completeContentTaskSchema = z
  .object({
    outcome: z.enum(['posted', 'deleted', 'failed']),
    telegramMessageId: z.number().int().positive().optional(),
    error: z.string().max(2000).optional(),
    terminal: z.boolean().optional(),
  })
  .refine((data) => data.outcome !== 'posted' || data.telegramMessageId !== undefined, {
    message: 'telegramMessageId is required when outcome is posted',
    path: ['telegramMessageId'],
  });

export type CompleteContentTaskInput = z.infer<typeof completeContentTaskSchema>;
