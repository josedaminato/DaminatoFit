import type { BrandId } from '@daminatofit/brand';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useBrand } from '@/brand/BrandProvider';
import { type ApiRequestContext, fetchJson, ApiError } from './api-client';
import { createAppAuthClient, type AppAuthClient } from './auth-client';
import { setBearerToken } from './auth-tokens';
import type { MeMembership, MeResponse } from './me-types';

interface SessionState {
  me: MeResponse | null;
  activeTenantId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface SessionContextValue extends SessionState {
  authClient: AppAuthClient;
  apiContext: ApiRequestContext;
  refreshMe: () => Promise<void>;
  setActiveTenantId: (tenantId: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  activeMembership: MeMembership | null;
  isTrainer: boolean;
  isStudent: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function tenantStorageKey(brandId: BrandId): string {
  return `${brandId}_active_tenant_id`;
}

async function readStoredTenant(brandId: BrandId): Promise<string | null> {
  return SecureStore.getItemAsync(tenantStorageKey(brandId));
}

async function writeStoredTenant(brandId: BrandId, tenantId: string | null): Promise<void> {
  const key = tenantStorageKey(brandId);
  if (!tenantId) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, tenantId);
}

function pickActiveTenant(me: MeResponse, stored: string | null): string | null {
  const ids = new Set(me.memberships.map((m) => m.tenantId));
  if (stored && ids.has(stored)) return stored;
  if (me.activeTenantId && ids.has(me.activeTenantId)) return me.activeTenantId;
  return me.memberships[0]?.tenantId ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { brand } = useBrand();
  const authClient = useMemo(() => createAppAuthClient(brand), [brand]);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [activeTenantId, setActiveTenantState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiContext = useMemo<ApiRequestContext>(
    () => ({
      brandId: brand.id,
      authClient,
      activeTenantId,
    }),
    [brand.id, authClient, activeTenantId],
  );

  const loadMe = useCallback(async () => {
    try {
      const stored = await readStoredTenant(brand.id);
      const data = await fetchJson<MeResponse>(
        { brandId: brand.id, authClient, activeTenantId: stored },
        '/v1/me',
      );
      const tenant = pickActiveTenant(data, stored);
      if (tenant !== stored) {
        await writeStoredTenant(brand.id, tenant);
      }
      setMe(data);
      setActiveTenantState(tenant);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        setActiveTenantState(null);
        await writeStoredTenant(brand.id, null);
      } else {
        setMe(null);
        setActiveTenantState(null);
      }
    }
  }, [authClient, brand.id]);

  const refreshMe = useCallback(async () => {
    const nextContext = { ...apiContext, activeTenantId };
    try {
      const data = await fetchJson<MeResponse>(nextContext, '/v1/me');
      const stored = await readStoredTenant(brand.id);
      const tenant = pickActiveTenant(data, stored);
      setMe(data);
      setActiveTenantState(tenant);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        setActiveTenantState(null);
      }
      throw error;
    }
  }, [apiContext, activeTenantId, brand.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      await loadMe();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const setActiveTenantId = useCallback(
    async (tenantId: string | null) => {
      await writeStoredTenant(brand.id, tenantId);
      setActiveTenantState(tenantId);
    },
    [brand.id],
  );

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Local session cleanup still runs if the network call fails.
    }
    await setBearerToken(brand.id, null);
    await writeStoredTenant(brand.id, null);
    setMe(null);
    setActiveTenantState(null);
  }, [authClient, brand.id]);

  const activeMembership = useMemo(() => {
    if (!me || !activeTenantId) return null;
    return me.memberships.find((m) => m.tenantId === activeTenantId) ?? null;
  }, [me, activeTenantId]);

  const isTrainer = activeMembership?.role === 'owner';
  const isStudent = activeMembership?.role === 'student';
  const isAuthenticated = me !== null;

  const value = useMemo<SessionContextValue>(
    () => ({
      me,
      activeTenantId,
      isLoading,
      isAuthenticated,
      authClient,
      apiContext,
      refreshMe,
      setActiveTenantId,
      signOut,
      activeMembership,
      isTrainer,
      isStudent,
    }),
    [
      me,
      activeTenantId,
      isLoading,
      isAuthenticated,
      authClient,
      apiContext,
      refreshMe,
      setActiveTenantId,
      signOut,
      activeMembership,
      isTrainer,
      isStudent,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }
  return value;
}
