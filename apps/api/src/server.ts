import { buildApp } from './app';
import { loadEnv } from './config/env';

async function main() {
  const env = loadEnv();
  const { app } = await buildApp(env);

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
