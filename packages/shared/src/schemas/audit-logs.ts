import { z } from 'zod';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../constants/audit';

const actionValues = Object.values(AUDIT_ACTIONS) as [string, ...string[]];
const targetTypeValues = Object.values(AUDIT_TARGET_TYPES) as [string, ...string[]];

export const auditLogQuerySchema = z.object({
  action: z.enum(actionValues).optional(),
  actorUserId: z.string().uuid({ message: 'actorUserId must be a valid id' }).optional(),
  targetType: z.enum(targetTypeValues).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
