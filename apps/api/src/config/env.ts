import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().min(1).default('dev'),
  API_PUBLIC_URL: z.string().url().default('http://127.0.0.1:3000'),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_APP: z.string().min(1).optional(),
  DATABASE_URL_ADMIN: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().min(1).default('noreply@daminatofit.local'),
  PUPIAPP_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  APP_LINK_BASE_DAMINATOFIT: z.string().min(1).default('daminatofit://invite'),
  APP_LINK_BASE_PUPIAPP: z.string().min(1).default('pupiapp://invite'),
  /** S3-compatible endpoint (RustFS local). */
  S3_ENDPOINT: z.string().url().default('http://127.0.0.1:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('daminatofit-media'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Provisional technical limits (configurable). Not commercial policy.
   * 50 MiB / 3 minutes / 512 MiB quota per trainer by default.
   */
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(52_428_800),
  MEDIA_MAX_DURATION_MS: z.coerce.number().int().positive().default(180_000),
  MEDIA_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MEDIA_PLAYBACK_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  DEFAULT_STORAGE_QUOTA_BYTES: z.coerce.number().int().positive().default(536_870_912),
  FFPROBE_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function requireDatabaseUrl(env: Env = loadEnv()): string {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  return env.DATABASE_URL;
}

export function requireAuthSecret(env: Env = loadEnv()): string {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required (min 32 characters)');
  }
  return env.BETTER_AUTH_SECRET;
}

export function requireS3(env: Env = loadEnv()) {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required');
  }
  return env;
}
