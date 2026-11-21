import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import imageSize from 'image-size';
import type { Env } from '../config/env';

export interface ImageProbeResult {
  sha256: string;
  sizeBytes: number;
  container: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  ok: boolean;
  rejectionReason: string | null;
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Server-side logo/image validation. Does not trust client MIME/extension.
 * SVG is rejected (unsafe arbitrary markup).
 */
export async function probeImageBuffer(env: Env, buffer: Buffer): Promise<ImageProbeResult> {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const sizeBytes = buffer.byteLength;
  const maxBytes = env.MEDIA_LOGO_MAX_BYTES;

  if (sizeBytes <= 0) {
    return {
      sha256,
      sizeBytes,
      container: null,
      mime: null,
      width: null,
      height: null,
      ok: false,
      rejectionReason: 'empty_file',
    };
  }

  if (sizeBytes > maxBytes) {
    return {
      sha256,
      sizeBytes,
      container: null,
      mime: null,
      width: null,
      height: null,
      ok: false,
      rejectionReason: 'file_too_large',
    };
  }

  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime ?? null;
  if (!detected || !mime || !ALLOWED.has(mime)) {
    return {
      sha256,
      sizeBytes,
      container: detected?.ext ?? null,
      mime,
      width: null,
      height: null,
      ok: false,
      rejectionReason: 'invalid_format',
    };
  }

  const container = detected.ext;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const dim = imageSize(buffer);
    width = dim.width ?? null;
    height = dim.height ?? null;
  } catch {
    return {
      sha256,
      sizeBytes,
      container,
      mime,
      width: null,
      height: null,
      ok: false,
      rejectionReason: 'invalid_format',
    };
  }

  if (!width || !height || width < 16 || height < 16) {
    return {
      sha256,
      sizeBytes,
      container,
      mime,
      width,
      height,
      ok: false,
      rejectionReason: 'invalid_dimensions',
    };
  }

  if (width > env.MEDIA_LOGO_MAX_DIMENSION || height > env.MEDIA_LOGO_MAX_DIMENSION) {
    return {
      sha256,
      sizeBytes,
      container,
      mime,
      width,
      height,
      ok: false,
      rejectionReason: 'dimensions_too_large',
    };
  }

  return {
    sha256,
    sizeBytes,
    container,
    mime,
    width,
    height,
    ok: true,
    rejectionReason: null,
  };
}
