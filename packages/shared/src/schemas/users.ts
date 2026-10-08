import { z } from 'zod';
import type { Role } from '../types/enums';

const ROLE_VALUES = ['scholar', 'faculty', 'registrar', 'admin'] as const satisfies readonly Role[];

export const roleChangeSchema = z.object({
  role: z.enum(ROLE_VALUES),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;
