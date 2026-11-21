import { pathToFileURL } from 'node:url';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { processNotificationQueue } from './modules/notifications/queue';
import { createPushAdapter } from './modules/notifications/push-adapter';

/**
 * One-shot queue pass for cron or a manual run. It is not a resident process.
 * PUSH_PROVIDER=mock never contacts Expo or a phone. A mock ticket is not delivery.
 */
async function main() {
  const env = loadEnv();
  const adapter = createPushAdapter({
    provider: env.PUSH_PROVIDER,
    accessToken: env.EXPO_ACCESS_TOKEN,
  });
  const { app, resources } = await buildApp(env, undefined, {
    autoProcessPush: false,
    pushAdapter: adapter,
  });
  try {
    const result = await processNotificationQueue(resources.appDb.sql, adapter, 50);
    console.log(JSON.stringify({ provider: adapter.name, ...result }));
  } finally {
    await app.close();
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
