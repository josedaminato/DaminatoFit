import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_HOST).toBe('0.0.0.0');
    expect(env.API_PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.APP_VERSION).toBe('dev');
    expect(env.API_PUBLIC_URL).toBe('http://127.0.0.1:3000');
  });

  it('coerces the port from a string', () => {
    expect(loadEnv({ API_PORT: '4100' }).API_PORT).toBe(4100);
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
