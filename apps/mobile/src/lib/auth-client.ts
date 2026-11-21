import { expoClient } from '@better-auth/expo/client';
import type { BrandConfig } from '@daminatofit/brand';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from './api';
import { setBearerToken } from './auth-tokens';

export { getBearerToken, persistAuthTokenFromHeaders, setBearerToken } from './auth-tokens';

export type AppAuthClient = ReturnType<typeof createAuthClient> & {
  getCookie: () => Promise<string>;
};

export function createAppAuthClient(brand: BrandConfig): AppAuthClient {
  const apiUrl = getApiUrl();
  const realm = brand.authRealm;

  return createAuthClient({
    baseURL: `${apiUrl}/auth/${realm}`,
    fetchOptions: {
      onResponse: async (context) => {
        const token = context.response.headers.get('set-auth-token');
        if (token) await setBearerToken(brand.id, token);
      },
    },
    plugins: [
      expoClient({
        scheme: brand.scheme,
        storagePrefix: brand.id,
        storage: SecureStore,
        cookiePrefix: `ba_${realm}`,
      }),
    ],
  }) as AppAuthClient;
}
