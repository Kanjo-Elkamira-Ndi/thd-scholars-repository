import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  action: z.string().trim().min(1).optional(),
  actorUserId: z.string().uuid({ message: 'actorUserId must be a valid id' }).optional(),
  targetType: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
