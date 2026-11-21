import {
  APP_BRAND_HEADER,
  HealthResponseSchema,
  type HealthResponse,
} from '@daminatofit/contracts';

const DEFAULT_API_URL = 'http://127.0.0.1:3000';

export function getApiUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

export async function fetchHealth(apiUrl: string, brandId: string): Promise<HealthResponse> {
  const response = await fetch(`${apiUrl}/health`, {
    headers: { [APP_BRAND_HEADER]: brandId },
  });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return HealthResponseSchema.parse(await response.json());
}
