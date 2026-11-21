import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_TITLE_MAX,
  AnnouncementWriteSchema,
  DirectMessageWriteSchema,
  PUSH_COPY,
  RegisterPushDeviceSchema,
} from './communications';

describe('communication contracts', () => {
  it('accepts plain text and rejects markup-looking control characters', () => {
    expect(
      AnnouncementWriteSchema.safeParse({ title: 'Cierre', body: 'El lunes no abrimos.' }).success,
    ).toBe(true);
    expect(
      AnnouncementWriteSchema.safeParse({
        title: 'A',
        body: 'linea\nsegunda',
      }).success,
    ).toBe(true);
    expect(AnnouncementWriteSchema.safeParse({ title: 'A', body: 'hola\u0000' }).success).toBe(
      false,
    );
    expect(
      AnnouncementWriteSchema.safeParse({
        title: 'x'.repeat(ANNOUNCEMENT_TITLE_MAX + 1),
        body: 'ok',
      }).success,
    ).toBe(false);
  });

  it('keeps push copy generic', () => {
    expect(PUSH_COPY.direct_message.body).not.toMatch(/rutina|peso|repet/i);
    expect(PUSH_COPY.announcement.body.length).toBeLessThan(180);
    expect(DirectMessageWriteSchema.safeParse({ membershipId: 'nope', body: 'hola' }).success).toBe(
      false,
    );
  });

  it('accepts Expo push token shapes only', () => {
    expect(
      RegisterPushDeviceSchema.safeParse({
        token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'android',
      }).success,
    ).toBe(true);
    expect(
      RegisterPushDeviceSchema.safeParse({
        token: 'raw-device-token',
        platform: 'ios',
      }).success,
    ).toBe(false);
  });
});
