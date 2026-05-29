import { z } from 'zod';

// Docker Compose forwards `${VAR}` as an empty string when the var is unset in
// .env; treat empty as "unset" so schema defaults still apply.
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

// Boolean from an env string ("true"/"false", case-insensitive).
const envBool = (def: 'true' | 'false') =>
  z.preprocess(
    emptyToUndef,
    z
      .string()
      .default(def)
      .transform((v) => v.toLowerCase() === 'true'),
  );

// Fraction in [0,1] from an env string, with a default.
const envFraction = (def: number) =>
  z.preprocess(emptyToUndef, z.coerce.number().min(0).max(1).default(def));

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
    PREFILTER_MIN_LENGTH: z.preprocess(
      emptyToUndef,
      z.coerce.number().int().positive().default(200),
    ),
    PREFILTER_EMPTY_ENABLED: envBool('true'),
    PREFILTER_MIN_LENGTH_ENABLED: envBool('true'),
    PREFILTER_SPAM_TITLE_RATIO_ENABLED: envBool('true'),
    PREFILTER_SPAM_LINK_DENSITY_ENABLED: envBool('true'),
    PREFILTER_TITLE_RATIO: envFraction(0.5),
    PREFILTER_LINK_DENSITY_RATIO: envFraction(0.5),
    // LLM configuration is role-based (primary / fallback), not
    // provider-name-baked-in. The same three knobs repeat per role; the
    // active provider name decides which model default applies (see
    // DEFAULT_MODELS + resolveProviderEnv below).
    LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
    LLM_PROVIDER_MODEL: z.preprocess(emptyToUndef, z.string().optional()),
    LLM_PROVIDER_API_KEY: z.string().min(1, 'LLM_PROVIDER_API_KEY is required'),
    // Fallback is opt-in: when LLM_FALLBACK_PROVIDER is set, the primary's
    // retry exhausts → one extra attempt on the fallback. Both the fallback
    // provider name AND its API key are required together.
    LLM_FALLBACK_PROVIDER: z.enum(['anthropic', 'openai']).optional(),
    LLM_FALLBACK_PROVIDER_MODEL: z.preprocess(
      emptyToUndef,
      z.string().optional(),
    ),
    LLM_FALLBACK_PROVIDER_API_KEY: z.preprocess(
      emptyToUndef,
      z.string().optional(),
    ),
    LLM_CONCURRENCY: z.coerce.number().int().positive().default(2),
    LLM_TOKEN_LIMIT_PER_ARTICLE: z.coerce
      .number()
      .int()
      .positive()
      .default(4000),
    // Article-analyze queue (async LLM analysis). A job retries up to
    // ANALYZE_MAX_ATTEMPTS times with a fixed ANALYZE_BACKOFF_SECONDS delay
    // between attempts (sitting in the queue's `delayed` set), then lands in
    // `failed`. ANALYZE_CONCURRENCY bounds how many analyze jobs are `active`
    // at once (the LlmService semaphore is the real LLM rate gate).
    ANALYZE_MAX_ATTEMPTS: z.preprocess(
      emptyToUndef,
      z.coerce.number().int().positive().default(20),
    ),
    ANALYZE_BACKOFF_SECONDS: z.preprocess(
      emptyToUndef,
      z.coerce.number().int().positive().default(60),
    ),
    ANALYZE_CONCURRENCY: z.preprocess(
      emptyToUndef,
      z.coerce.number().int().positive().default(2),
    ),
    // Graph customize-canvas selection cap (per kind). UUID + comma is ~37
    // chars, so 100 * 2 = ~7.4KB query string — well under Node's default
    // 16KB max-http-header-size. Surfaced to the frontend via /api/config
    // so the panel can disable selection past the cap.
    GRAPH_SELECTION_CAP: z.preprocess(
      emptyToUndef,
      z.coerce.number().int().positive().default(100),
    ),
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
      if (!env.LLM_FALLBACK_PROVIDER_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['LLM_FALLBACK_PROVIDER_API_KEY'],
          message:
            'LLM_FALLBACK_PROVIDER_API_KEY is required when LLM_FALLBACK_PROVIDER is set',
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/**
 * Default model name per provider. Applied when LLM_PROVIDER_MODEL (or
 * LLM_FALLBACK_PROVIDER_MODEL) is unset — preserves the pre-rename behaviour
 * where you didn't have to pick a model just to get the app running.
 */
export const DEFAULT_MODELS: Record<'anthropic' | 'openai', string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
};

/**
 * Resolve `{apiKey, model}` for the given provider given its current role
 * (primary or fallback) per `LLM_PROVIDER` / `LLM_FALLBACK_PROVIDER`. When
 * the provider is neither primary nor fallback, returns an empty apiKey — the
 * adapter is constructed lazily and only the role it's actually in is ever
 * called, so the empty key is fine. (If something does call the unused
 * adapter, the lazy client guard throws a clear error.)
 */
export function resolveProviderEnv(provider: 'anthropic' | 'openai'): {
  apiKey: string;
  model: string;
} {
  const env = loadEnv();
  if (env.LLM_PROVIDER === provider) {
    return {
      apiKey: env.LLM_PROVIDER_API_KEY,
      model: env.LLM_PROVIDER_MODEL ?? DEFAULT_MODELS[provider],
    };
  }
  if (env.LLM_FALLBACK_PROVIDER === provider) {
    return {
      apiKey: env.LLM_FALLBACK_PROVIDER_API_KEY ?? '',
      model: env.LLM_FALLBACK_PROVIDER_MODEL ?? DEFAULT_MODELS[provider],
    };
  }
  return { apiKey: '', model: DEFAULT_MODELS[provider] };
}

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
