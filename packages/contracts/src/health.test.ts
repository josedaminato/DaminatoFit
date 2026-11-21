import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health';

describe('HealthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const payload = {
      status: 'ok',
      service: 'daminatofit-api',
      version: '0.0.0',
      uptimeSeconds: 1.5,
    };
    expect(HealthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects payloads from other services', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      service: 'appmedica',
      version: '1.0.0',
      uptimeSeconds: 1,
    });
    expect(result.success).toBe(false);
  });
});
