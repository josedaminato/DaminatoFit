import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import ffprobeStatic from 'ffprobe-static';
import type { Env } from '../config/env';

export interface MediaProbeResult {
  sha256: string;
  sizeBytes: number;
  container: string | null;
  mime: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  ok: boolean;
  rejectionReason: string | null;
}

function resolveFfprobePath(env: Env): string {
  return env.FFPROBE_PATH?.trim() || ffprobeStatic.path;
}

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffprobe_timeout'));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function ffprobeMeta(
  env: Env,
  filePath: string,
): Promise<
  | {
      ok: true;
      durationMs: number;
      width: number | null;
      height: number | null;
      codec: string | null;
    }
  | { ok: false; reason: 'probe_unavailable' | 'probe_failed' | 'duration_unverified' }
> {
  const bin = resolveFfprobePath(env);
  const timeoutMs = env.MEDIA_PROBE_TIMEOUT_MS;
  try {
    const { code, stdout } = await run(
      bin,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      timeoutMs,
    );
    if (code !== 0) {
      return { ok: false, reason: 'probe_failed' };
    }
    const json = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }>;
    };
    const durationSec = json.format?.duration ? Number(json.format.duration) : NaN;
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return { ok: false, reason: 'duration_unverified' };
    }
    const video = json.streams?.find((s) => s.codec_type === 'video');
    if (!video) {
      return { ok: false, reason: 'probe_failed' };
    }
    return {
      ok: true,
      durationMs: Math.round(durationSec * 1000),
      width: video.width ?? null,
      height: video.height ?? null,
      codec: video.codec_name ?? null,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'ffprobe_timeout') {
      return { ok: false, reason: 'probe_failed' };
    }
    return { ok: false, reason: 'probe_unavailable' };
  }
}

function fail(
  sha256: string,
  sizeBytes: number,
  rejectionReason: string,
  partial: Partial<MediaProbeResult> = {},
): MediaProbeResult {
  return {
    sha256,
    sizeBytes,
    container: partial.container ?? null,
    mime: partial.mime ?? null,
    durationMs: partial.durationMs ?? null,
    width: partial.width ?? null,
    height: partial.height ?? null,
    videoCodec: partial.videoCodec ?? null,
    ok: false,
    rejectionReason,
  };
}

/**
 * Server-side validation. Does not trust client MIME/extension.
 * Duration and container inspection via ffprobe are mandatory before ready.
 */
export async function probeVideoBuffer(env: Env, buffer: Buffer): Promise<MediaProbeResult> {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const sizeBytes = buffer.byteLength;

  if (sizeBytes <= 0) {
    return fail(sha256, sizeBytes, 'empty_file');
  }

  if (sizeBytes > env.MEDIA_MAX_BYTES) {
    return fail(sha256, sizeBytes, 'file_too_large');
  }

  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime ?? null;
  const allowed = mime === 'video/mp4' || mime === 'video/quicktime';
  if (!allowed) {
    return fail(sha256, sizeBytes, 'invalid_format', {
      container: detected?.ext ?? null,
      mime,
    });
  }

  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmp = path.join(os.tmpdir(), `df-media-${sha256.slice(0, 16)}.mp4`);

  try {
    await fs.writeFile(tmp, buffer);
    const probed = await ffprobeMeta(env, tmp);
    if (!probed.ok) {
      return fail(sha256, sizeBytes, probed.reason, { container: 'mp4', mime });
    }

    if (probed.durationMs > env.MEDIA_MAX_DURATION_MS) {
      return fail(sha256, sizeBytes, 'duration_too_long', {
        container: 'mp4',
        mime,
        durationMs: probed.durationMs,
        width: probed.width,
        height: probed.height,
        videoCodec: probed.codec,
      });
    }

    return {
      sha256,
      sizeBytes,
      container: 'mp4',
      mime,
      durationMs: probed.durationMs,
      width: probed.width,
      height: probed.height,
      videoCodec: probed.codec,
      ok: true,
      rejectionReason: null,
    };
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}
