import type {
  AppearanceColorId,
  AppearanceFontId,
  AppearanceStyleId,
  ResolvedAppearanceTokens,
  TenantAppearanceConfig,
} from '@daminatofit/brand';
import type { ApiRequestContext } from '@/lib/api-client';
import { fetchJson } from '@/lib/api-client';

export interface MeAppearanceResponse {
  appearance: TenantAppearanceConfig;
  logoUrl: string | null;
  tokens: Pick<ResolvedAppearanceTokens, 'styleId' | 'colorId' | 'fontId' | 'colors' | 'layout'>;
  editable: boolean;
}

export async function fetchMeAppearance(ctx: ApiRequestContext): Promise<MeAppearanceResponse> {
  return fetchJson<MeAppearanceResponse>(ctx, '/v1/me/appearance');
}

export async function saveMeAppearance(
  ctx: ApiRequestContext,
  body: {
    styleId: AppearanceStyleId;
    colorId: AppearanceColorId;
    fontId: AppearanceFontId;
    logoMediaId?: string | null;
  },
): Promise<{ appearance: TenantAppearanceConfig }> {
  return fetchJson(ctx, '/v1/me/appearance', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function resetMeAppearance(
  ctx: ApiRequestContext,
): Promise<{ appearance: TenantAppearanceConfig }> {
  return fetchJson(ctx, '/v1/me/appearance/reset', { method: 'POST' });
}

export type LogoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export function normalizeLogoContentType(mime: string | null | undefined): LogoContentType | null {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'image/png') return 'image/png';
  if (mime === 'image/webp') return 'image/webp';
  return null;
}

export async function uploadLogoImage(
  ctx: ApiRequestContext,
  localUri: string,
  contentType: LogoContentType,
  declaredSizeBytes: number,
): Promise<string> {
  const { assetId, uploadUrl } = await fetchJson<{ assetId: string; uploadUrl: string }>(
    ctx,
    '/v1/media/uploads',
    {
      method: 'POST',
      body: JSON.stringify({ contentType, declaredSizeBytes, purpose: 'logo' }),
    },
  );

  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResponse.ok) {
    throw new Error('upload_failed');
  }

  await fetchJson(ctx, `/v1/media/${assetId}/confirm`, { method: 'POST' });
  return assetId;
}
