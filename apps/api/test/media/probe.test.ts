import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { probeVideoBuffer } from '../../src/lib/media-probe';

const sampleMp4 = readFileSync(join(__dirname, '../fixtures/sample.mp4'));

describe('media probe (ffprobe required)', () => {
  it('accepts a real short mp4 via bundled ffprobe', async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      MEDIA_MAX_BYTES: '52428800',
      MEDIA_MAX_DURATION_MS: '180000',
      MEDIA_PROBE_TIMEOUT_MS: '15000',
    });
    const result = await probeVideoBuffer(env, sampleMp4);
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.mime).toMatch(/video\//);
  });

  it('rejects when ffprobe binary is missing', async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      FFPROBE_PATH: join(__dirname, 'does-not-exist-ffprobe'),
      MEDIA_MAX_BYTES: '52428800',
      MEDIA_MAX_DURATION_MS: '180000',
      MEDIA_PROBE_TIMEOUT_MS: '5000',
    });
    const result = await probeVideoBuffer(env, sampleMp4);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe('probe_unavailable');
  });

  it('rejects invalid format without trusting client MIME', async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      MEDIA_MAX_BYTES: '52428800',
      MEDIA_MAX_DURATION_MS: '180000',
    });
    const result = await probeVideoBuffer(env, Buffer.from('not-a-video'));
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe('invalid_format');
  });

  it('rejects duration beyond configured max', async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      MEDIA_MAX_BYTES: '52428800',
      MEDIA_MAX_DURATION_MS: '500',
      MEDIA_PROBE_TIMEOUT_MS: '15000',
    });
    const result = await probeVideoBuffer(env, sampleMp4);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe('duration_too_long');
  });
});
