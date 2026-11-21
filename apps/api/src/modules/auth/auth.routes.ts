import type { FastifyInstance } from 'fastify';
import type { AuthInstance } from './realms';
import { isRealmId } from './realms';
import { fromFastifyHeaders } from './session';

export async function authRoutes(
  app: FastifyInstance,
  opts: { auths: Record<string, AuthInstance> },
): Promise<void> {
  app.route({
    method: ['GET', 'POST'],
    url: '/auth/:realm/*',
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const realmParam = (request.params as { realm: string }).realm;
      if (!isRealmId(realmParam)) {
        return reply.code(404).send({ error: 'unknown_realm' });
      }

      const auth = opts.auths[realmParam];
      if (!auth) {
        return reply.code(404).send({ error: 'unknown_realm' });
      }
      const host = request.headers.host ?? '127.0.0.1';
      const proto = request.headers['x-forwarded-proto'] ?? 'http';
      const url = new URL(request.url, `${proto}://${host}`);

      const headers = fromFastifyHeaders(request);
      const init: RequestInit = {
        method: request.method,
        headers,
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (request.body !== undefined && request.body !== null) {
          if (Buffer.isBuffer(request.body)) {
            init.body = new Uint8Array(request.body);
          } else if (typeof request.body === 'string') {
            init.body = request.body;
          } else {
            init.body = JSON.stringify(request.body);
            headers.set('content-type', 'application/json');
          }
        }
      }

      const response = await auth.handler(new Request(url, init));
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // Fastify manages content-length / transfer-encoding.
        if (key.toLowerCase() === 'content-encoding') return;
        reply.header(key, value);
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      return reply.send(buffer);
    },
  });
}
