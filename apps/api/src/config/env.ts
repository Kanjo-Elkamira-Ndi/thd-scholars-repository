import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: path.join(__dirname, '..', '..', '.env') });

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    API_INTERNAL_TOKEN: z.string().min(1, 'API_INTERNAL_TOKEN is required'),
    MINIAPP_ORIGIN: z.string().url().min(1, 'MINIAPP_ORIGIN is required'),
    BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
    TELEGRAM_AUTH_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86400),
    AUTH_MOCK_ENABLED: z
      .string()
      .optional()
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((data, ctx) => {
    if (data.AUTH_MOCK_ENABLED && data.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AUTH_MOCK_ENABLED=true is forbidden when NODE_ENV=production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

const parseEnv = (): Env => {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return result.data;
};

export const env = parseEnv();