import { HealthResponseSchema } from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './config/env';

describe('API app', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_VERSION: '1.2.3' }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health matches the shared contract', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(response.json());
    expect(body.version).toBe('1.2.3');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });
});
