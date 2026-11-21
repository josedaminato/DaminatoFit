import {
  APP_BRAND_HEADER,
  HealthResponseSchema,
  type HealthResponse,
} from '@daminatofit/contracts';

export function getApiUrl(): string | null {
  return process.env.EXPO_PUBLIC_API_URL ?? null;
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
