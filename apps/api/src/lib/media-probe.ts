import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
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

function run(
  command: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function ffprobeMeta(
  env: Env,
  filePath: string,
): Promise<{
  durationMs: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}> {
  const bin = env.FFPROBE_PATH ?? 'ffprobe';
  try {
    const { code, stdout } = await run(bin, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    if (code !== 0) {
      return { durationMs: null, width: null, height: null, codec: null };
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
    const video = json.streams?.find((s) => s.codec_type === 'video');
    return {
      durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      codec: video?.codec_name ?? null,
    };
  } catch {
    return { durationMs: null, width: null, height: null, codec: null };
  }
}

/**
 * Server-side validation. Does not trust client MIME/extension.
 * Duration uses ffprobe when available; otherwise only container+size are enforced.
 */
export async function probeVideoBuffer(env: Env, buffer: Buffer): Promise<MediaProbeResult> {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const sizeBytes = buffer.byteLength;

  if (sizeBytes <= 0) {
    return {
      sha256,
      sizeBytes,
      container: null,
      mime: null,
      durationMs: null,
      width: null,
      height: null,
      videoCodec: null,
      ok: false,
      rejectionReason: 'empty_file',
    };
  }

  if (sizeBytes > env.MEDIA_MAX_BYTES) {
    return {
      sha256,
      sizeBytes,
      container: null,
      mime: null,
      durationMs: null,
      width: null,
      height: null,
      videoCodec: null,
      ok: false,
      rejectionReason: 'file_too_large',
    };
  }

  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime ?? null;
  const allowed = mime === 'video/mp4' || mime === 'video/quicktime';
  if (!allowed) {
    return {
      sha256,
      sizeBytes,
      container: detected?.ext ?? null,
      mime,
      durationMs: null,
      width: null,
      height: null,
      videoCodec: null,
      ok: false,
      rejectionReason: 'invalid_format',
    };
  }

  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmp = path.join(os.tmpdir(), `df-media-${sha256.slice(0, 16)}.mp4`);
  let durationMs: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let videoCodec: string | null = null;

  try {
    await fs.writeFile(tmp, buffer);
    const probed = await ffprobeMeta(env, tmp);
    durationMs = probed.durationMs;
    width = probed.width;
    height = probed.height;
    videoCodec = probed.codec;
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }

  if (durationMs !== null && durationMs > env.MEDIA_MAX_DURATION_MS) {
    return {
      sha256,
      sizeBytes,
      container: 'mp4',
      mime,
      durationMs,
      width,
      height,
      videoCodec,
      ok: false,
      rejectionReason: 'duration_too_long',
    };
  }

  return {
    sha256,
    sizeBytes,
    container: 'mp4',
    mime,
    durationMs,
    width,
    height,
    videoCodec,
    ok: true,
    rejectionReason: null,
  };
}
