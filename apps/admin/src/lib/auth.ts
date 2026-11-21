import { createAuthClient } from 'better-auth/react';
import { API_URL } from './api';

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/auth/daminatofit',
});

const TOKEN_KEY = 'daminatofit_admin_bearer';

export function readBearer(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function writeBearer(token: string | null) {
  if (!token) sessionStorage.removeItem(TOKEN_KEY);
  else sessionStorage.setItem(TOKEN_KEY, token);
}
