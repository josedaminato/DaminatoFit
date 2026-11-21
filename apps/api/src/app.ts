import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env';
import { healthRoutes } from './modules/health/health.routes';

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.LOG_LEVEL === 'silent' ? false : { level: env.LOG_LEVEL },
  });

  await app.register(healthRoutes, { version: env.APP_VERSION });

  return app;
}
