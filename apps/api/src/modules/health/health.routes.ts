import type { HealthResponse } from '@daminatofit/contracts';
import type { FastifyPluginAsync } from 'fastify';

export interface HealthRoutesOptions {
  version: string;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, { version }) => {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    service: 'daminatofit-api',
    version,
    uptimeSeconds: process.uptime(),
  }));
};
