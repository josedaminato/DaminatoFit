import { z } from 'zod';

/** Keep these strings identical to the SQL enqueue copy in 0008_communications.sql. */
export const PUSH_COPY = {
  announcement: {
    title: 'Nuevo aviso',
    body: 'Tenés un aviso nuevo de tu entrenador.',
  },
  direct_message: {
    title: 'Nuevo mensaje',
    body: 'Tenés un nuevo mensaje de tu entrenador.',
  },
} as const;

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;
export const DIRECT_MESSAGE_BODY_MAX = 2000;
export const PUSH_TOKEN_MAX = 200;
export const DEVICE_LABEL_MAX = 80;

function hasDisallowedControl(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) return true;
  }
  return false;
}

export function plainText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasDisallowedControl(value), { message: 'invalid_characters' });
}

export const AnnouncementWriteSchema = z.object({
  title: plainText(ANNOUNCEMENT_TITLE_MAX),
  body: plainText(ANNOUNCEMENT_BODY_MAX),
});

export const DirectMessageWriteSchema = z.object({
  membershipId: z.string().uuid(),
  body: plainText(DIRECT_MESSAGE_BODY_MAX),
});

export const PushTokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(PUSH_TOKEN_MAX)
  .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/);

export const RegisterPushDeviceSchema = z.object({
  token: PushTokenSchema,
  platform: z.enum(['ios', 'android']),
  label: plainText(DEVICE_LABEL_MAX).optional(),
});

export const RevokePushDeviceSchema = z.object({
  token: PushTokenSchema,
});

export const NotificationPreferencesSchema = z.object({
  pushAnnouncements: z.boolean(),
  pushDirectMessages: z.boolean(),
});

export const NotificationPreferencesPatchSchema = NotificationPreferencesSchema.partial().refine(
  (value) => value.pushAnnouncements !== undefined || value.pushDirectMessages !== undefined,
  { message: 'empty_patch' },
);

export type AnnouncementWrite = z.infer<typeof AnnouncementWriteSchema>;
export type DirectMessageWrite = z.infer<typeof DirectMessageWriteSchema>;
