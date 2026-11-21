import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().min(1).default('dev'),
  /** Public base URL of the API (used by Better Auth links). */
  API_PUBLIC_URL: z.string().url().default('http://127.0.0.1:3000'),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_APP: z.string().min(1).optional(),
  DATABASE_URL_ADMIN: z.string().min(1).optional(),
  /** At least 32 characters. Never commit the real value. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().min(1).default('noreply@daminatofit.local'),
  /**
   * One-time bootstrap secret for creating the sole PupiApp trainer.
   * Required only when calling the bootstrap endpoint. Local placeholder only.
   */
  PUPIAPP_BOOTSTRAP_SECRET: z.string().min(16).optional(),
  APP_LINK_BASE_DAMINATOFIT: z.string().min(1).default('daminatofit://invite'),
  APP_LINK_BASE_PUPIAPP: z.string().min(1).default('pupiapp://invite'),
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
