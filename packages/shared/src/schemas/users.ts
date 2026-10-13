import { z } from 'zod';
import { ROLES } from '../types/enums';

export const roleChangeSchema = z.object({
  role: z.enum(ROLES),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;
