import { fetchJson, type ApiRequestContext } from '@/lib/api-client';

export interface RecommendationItem {
  id: string;
  tenantId: string;
  categorySlug: string;
  categoryName: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  destinationKind: 'website' | 'whatsapp' | 'instagram' | 'maps' | 'other';
  destinationUrl: string;
  actionLabel: string | null;
  benefitLabel: string | null;
  benefitDescription: string | null;
  promoCode: string | null;
  benefitTerms: string | null;
  benefitExpiresOn: string | null;
  benefitActive: boolean;
  benefitExpired: boolean;
  professionalLicense: string | null;
  licenseVerifiedByPlatform: false;
  commercialDeclared: boolean;
  status: 'draft' | 'published' | 'hidden' | 'archived';
  sortOrder: number;
  moderationHidden: boolean;
  trainerName: string | null;
  certifiedByPlatform: false;
}

export interface RecommendationWriteInput {
  categorySlug: string;
  name: string;
  description?: string;
  destinationKind: RecommendationItem['destinationKind'];
  destinationUrl: string;
  actionLabel?: string;
  benefitLabel?: string;
  benefitDescription?: string;
  promoCode?: string;
  benefitTerms?: string;
  benefitExpiresOn?: string | null;
  professionalLicense?: string;
  commercialDeclared: boolean;
}

export function listCategories(ctx: ApiRequestContext) {
  return fetchJson<{ items: { slug: string; name: string }[]; note: string }>(
    ctx,
    '/v1/recommendation-categories',
  );
}

export function listOwnRecommendations(ctx: ApiRequestContext) {
  return fetchJson<{ items: RecommendationItem[] }>(ctx, '/v1/recommendations');
}

export function listPublishedRecommendations(ctx: ApiRequestContext) {
  return fetchJson<{ items: RecommendationItem[]; notice: string }>(
    ctx,
    '/v1/recommendations/published',
  );
}

export function getRecommendation(ctx: ApiRequestContext, id: string) {
  return fetchJson<RecommendationItem>(ctx, `/v1/recommendations/${id}`);
}

export function createRecommendation(ctx: ApiRequestContext, input: RecommendationWriteInput) {
  return fetchJson<{ id: string; status: string }>(ctx, '/v1/recommendations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRecommendation(
  ctx: ApiRequestContext,
  id: string,
  input: RecommendationWriteInput,
) {
  return fetchJson<{ id: string; status: string }>(ctx, `/v1/recommendations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function recommendationAction(
  ctx: ApiRequestContext,
  id: string,
  action: 'publish' | 'hide' | 'archive',
) {
  return fetchJson<{ id: string; status: string }>(ctx, `/v1/recommendations/${id}/${action}`, {
    method: 'POST',
  });
}

export function reorderRecommendations(ctx: ApiRequestContext, ids: string[]) {
  return fetchJson<{ reordered: boolean }>(ctx, '/v1/recommendations/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export function reportRecommendation(
  ctx: ApiRequestContext,
  id: string,
  input: { reason: string; details?: string },
) {
  return fetchJson<{ id: string; status: string }>(ctx, `/v1/recommendations/${id}/report`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
