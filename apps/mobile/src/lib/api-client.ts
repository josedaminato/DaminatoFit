import { APP_BRAND_HEADER, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { BrandId } from '@daminatofit/brand';
import type { AppAuthClient } from './auth-client';
import { getBearerToken, persistAuthTokenFromHeaders } from './auth-tokens';
import { getApiUrl } from './api';

export interface ApiRequestContext {
  brandId: BrandId;
  authClient: AppAuthClient;
  activeTenantId: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(
  ctx: ApiRequestContext,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiUrl = getApiUrl();
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set(APP_BRAND_HEADER, ctx.brandId);

  if (ctx.activeTenantId) {
    headers.set(TENANT_ID_HEADER, ctx.activeTenantId);
  }

  const cookie = await ctx.authClient.getCookie();
  if (cookie) {
    headers.set('cookie', cookie);
  }

  const bearer = await getBearerToken(ctx.brandId);
  if (bearer) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    credentials: 'omit',
  });

  await persistAuthTokenFromHeaders(ctx.brandId, response.headers);

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `request_failed_${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}
