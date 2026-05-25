import { z } from 'zod';

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  BULL_BOARD_USER: z.string().min(1),
  BULL_BOARD_PASS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  APP_DEV_MODE: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  APP_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
  PREFILTER_MIN_LENGTH: z.coerce.number().int().positive().default(200),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error('[env] Invalid environment variables:', parsed.error.format());
      throw new Error('Invalid environment configuration');
    }
    cached = parsed.data;
  }
  return cached;
}
