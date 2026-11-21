import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: 'dev',
    });
  });

  it('coerces the port from a string', () => {
    expect(loadEnv({ API_PORT: '4100' }).API_PORT).toBe(4100);
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
