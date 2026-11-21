import type { BrandId } from '@daminatofit/brand';
import * as SecureStore from 'expo-secure-store';

function bearerStorageKey(brandId: BrandId): string {
  return `${brandId}_bearer_token`;
}

export async function getBearerToken(brandId: BrandId): Promise<string | null> {
  return SecureStore.getItemAsync(bearerStorageKey(brandId));
}

export async function setBearerToken(brandId: BrandId, token: string | null): Promise<void> {
  const key = bearerStorageKey(brandId);
  if (!token) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, token);
}

export async function persistAuthTokenFromHeaders(
  brandId: BrandId,
  headers: Headers,
): Promise<void> {
  const token = headers.get('set-auth-token');
  if (token) await setBearerToken(brandId, token);
}
