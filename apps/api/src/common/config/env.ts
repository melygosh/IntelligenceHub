import { z } from 'zod';

// Boolean from an env string ("true"/"false", case-insensitive).
const envBool = (def: 'true' | 'false') =>
  z
    .string()
    .default(def)
    .transform((v) => v.toLowerCase() === 'true');

const EnvSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(3011),
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
    // Pre-filter (deterministic, pre-LLM rejection). Each check can be toggled
    // off; the spam checks' thresholds are tunable (fraction of body, 0..1).
    PREFILTER_MIN_LENGTH: z.coerce.number().int().positive().default(200),
    PREFILTER_EMPTY_ENABLED: envBool('true'),
    PREFILTER_MIN_LENGTH_ENABLED: envBool('true'),
    PREFILTER_SPAM_TITLE_RATIO_ENABLED: envBool('true'),
    PREFILTER_SPAM_LINK_DENSITY_ENABLED: envBool('true'),
    PREFILTER_TITLE_RATIO: z.coerce.number().min(0).max(1).default(0.5),
    PREFILTER_LINK_DENSITY_RATIO: z.coerce.number().min(0).max(1).default(0.5),
    LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
    LLM_FALLBACK_PROVIDER: z.enum(['anthropic', 'openai']).optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    LLM_MODEL_OPENAI: z.string().default('gpt-4o-mini'),
    LLM_MODEL_ANTHROPIC: z.string().default('claude-haiku-4-5'),
    LLM_CONCURRENCY: z.coerce.number().int().positive().default(2),
    LLM_TOKEN_LIMIT_PER_ARTICLE: z.coerce
      .number()
      .int()
      .positive()
      .default(4000),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_FALLBACK_PROVIDER) {
      if (env.LLM_FALLBACK_PROVIDER === env.LLM_PROVIDER) {
        ctx.addIssue({
          code: 'custom',
          path: ['LLM_FALLBACK_PROVIDER'],
          message: 'must differ from LLM_PROVIDER',
        });
      }
      const requiredKey =
        env.LLM_FALLBACK_PROVIDER === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : 'OPENAI_API_KEY';
      if (!env[requiredKey]) {
        ctx.addIssue({
          code: 'custom',
          path: [requiredKey],
          message: `${requiredKey} is required when LLM_FALLBACK_PROVIDER=${env.LLM_FALLBACK_PROVIDER}`,
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error(
        '[env] Invalid environment variables:',
        parsed.error.format(),
      );
      throw new Error('Invalid environment configuration');
    }
    cached = parsed.data;
  }
  return cached;
}
