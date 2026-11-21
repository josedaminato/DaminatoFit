import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env';
import { requireAuthSecret, requireDatabaseUrl } from './config/env';
import { closeDb, createDb, type DbHandles } from './db/client';
import { authRoutes } from './modules/auth/auth.routes';
import { createAuthRealms } from './modules/auth/realms';
import { healthRoutes } from './modules/health/health.routes';
import { invitationsRoutes } from './modules/invitations/invitations.routes';
import { meRoutes } from './modules/me/me.routes';
import { exercisesRoutes } from './modules/exercises/exercises.routes';
import { mediaRoutes } from './modules/media/media.routes';
import { appearanceRoutes } from './modules/appearance/appearance.routes';
import { communicationsRoutes } from './modules/communications/communications.routes';
import { recommendationsRoutes } from './modules/recommendations/recommendations.routes';
import { createPushAdapter, type PushAdapter } from './modules/notifications/push-adapter';
import { routinesRoutes } from './modules/routines/routines.routes';
import { progressRoutes } from './modules/workouts/progress.routes';
import { workoutsRoutes } from './modules/workouts/workouts.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { trainersRoutes } from './modules/trainers/trainers.routes';

export interface AppResources {
  migrator: DbHandles;
  appDb: DbHandles;
}

export async function buildApp(
  env: Env,
  resources?: AppResources,
  extras?: { pushAdapter?: PushAdapter; autoProcessPush?: boolean },
): Promise<{ app: FastifyInstance; resources: AppResources }> {
  requireAuthSecret(env);
  const databaseUrl = requireDatabaseUrl(env);
  const appDatabaseUrl = env.DATABASE_URL_APP ?? databaseUrl;

  const owned = !resources;
  const migrator = resources?.migrator ?? createDb(databaseUrl);
  const appDb = resources?.appDb ?? createDb(appDatabaseUrl);
  const resolved: AppResources = { migrator, appDb };

  // Domain soft-delete runs as migrator inside Better Auth beforeDelete (SECURITY DEFINER).
  const auths = createAuthRealms(migrator.db, env, migrator.sql);

  const app = Fastify({
    logger: env.LOG_LEVEL === 'silent' ? false : { level: env.LOG_LEVEL },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
    exposedHeaders: ['set-auth-token'],
  });
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(healthRoutes, { version: env.APP_VERSION });
  await app.register(authRoutes, { auths });
  await app.register(trainersRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
    env,
  });
  await app.register(invitationsRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
    env,
  });
  await app.register(meRoutes, { auths, appSql: appDb.sql });
  await app.register(exercisesRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
  });
  await app.register(mediaRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
    env,
  });
  await app.register(routinesRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
  });
  await app.register(workoutsRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
  });
  await app.register(progressRoutes, {
    auths,
    appSql: appDb.sql,
  });
  await app.register(appearanceRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
    env,
  });
  await app.register(recommendationsRoutes, {
    auths,
    appSql: appDb.sql,
    env,
  });
  await app.register(communicationsRoutes, {
    auths,
    appSql: appDb.sql,
    pushAdapter:
      extras?.pushAdapter ??
      createPushAdapter({ provider: env.PUSH_PROVIDER, accessToken: env.EXPO_ACCESS_TOKEN }),
    autoProcessPush: extras?.autoProcessPush ?? env.PUSH_AUTOPROCESS,
    limits: {
      announcementsPerDay: env.ANNOUNCEMENTS_PER_DAY,
      messagesPerHour: env.DIRECT_MESSAGES_PER_HOUR,
      messagesPerRecipientPerDay: env.DIRECT_MESSAGES_PER_RECIPIENT_PER_DAY,
    },
  });
  await app.register(adminRoutes, {
    auths,
    appSql: appDb.sql,
    migratorSql: migrator.sql,
    env,
  });

  app.addHook('onClose', async () => {
    if (owned) {
      await closeDb(appDb);
      await closeDb(migrator);
    }
  });

  return { app, resources: resolved };
}
