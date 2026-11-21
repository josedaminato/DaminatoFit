import type {
  AppearanceLayoutTokens,
  AppearanceStyleId,
  TenantAppearanceConfig,
} from '@daminatofit/brand';
import { resolveAppearanceTokens } from '@daminatofit/brand';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMeAppearance, type MeAppearanceResponse } from '@/brand/appearance-api';
import { BrandContext, type BrandContextValue, useBrandBase } from '@/brand/BrandProvider';
import { fontFamiliesForId, type AppearanceFontFamilies } from '@/brand/fonts';
import { useSession } from '@/lib/session';

interface AppearanceContextValue {
  editable: boolean;
  appearance: TenantAppearanceConfig | null;
  logoUrl: string | null;
  isLoading: boolean;
  setDraft: (config: TenantAppearanceConfig | null) => void;
  reload: () => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function overlayActiveForBrand(distribution: string): boolean {
  return distribution === 'platform';
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const base = useBrandBase();
  const { apiContext, isAuthenticated, activeMembership, activeTenantId } = useSession();

  const [serverData, setServerData] = useState<MeAppearanceResponse | null>(null);
  const [draftConfig, setDraftConfig] = useState<TenantAppearanceConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const shouldLoad =
    overlayActiveForBrand(base.brand.distribution) &&
    isAuthenticated &&
    activeMembership !== null &&
    activeTenantId !== null;

  const membershipKey = activeMembership?.id ?? null;

  const loadAppearance = useCallback(async () => {
    if (!shouldLoad) {
      setServerData(null);
      return;
    }
    try {
      const data = await fetchMeAppearance(apiContext);
      setServerData(data);
    } catch {
      setServerData(null);
    }
  }, [apiContext, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchMeAppearance(apiContext);
        if (!cancelled) {
          setServerData(data);
          setDraftConfig(null);
        }
      } catch {
        if (!cancelled) setServerData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, shouldLoad, membershipKey, activeTenantId]);

  const activeServer = shouldLoad ? serverData : null;
  const effectiveConfig = draftConfig ?? activeServer?.appearance ?? null;

  const resolvedTokens = useMemo(() => {
    if (!shouldLoad || !effectiveConfig) return null;
    return resolveAppearanceTokens(effectiveConfig, base.colorScheme);
  }, [shouldLoad, effectiveConfig, base.colorScheme]);

  const mergedBrand = useMemo<BrandContextValue>(() => {
    if (!resolvedTokens) {
      return {
        ...base,
        layout: undefined,
        fontFamily: undefined,
        logoUrl: null,
        styleId: undefined,
        appearanceOverlay: false,
      };
    }

    const fontFamily: AppearanceFontFamilies = fontFamiliesForId(resolvedTokens.fontId);
    const layout: AppearanceLayoutTokens = resolvedTokens.layout;

    return {
      ...base,
      colors: resolvedTokens.colors,
      layout,
      fontFamily,
      logoUrl: activeServer?.logoUrl ?? null,
      styleId: resolvedTokens.styleId as AppearanceStyleId,
      appearanceOverlay: true,
    };
  }, [base, resolvedTokens, activeServer?.logoUrl]);

  const appearanceApi = useMemo<AppearanceContextValue>(
    () => ({
      editable: overlayActiveForBrand(base.brand.distribution) && (activeServer?.editable ?? false),
      appearance: effectiveConfig,
      logoUrl: mergedBrand.logoUrl ?? null,
      isLoading,
      setDraft: setDraftConfig,
      reload: loadAppearance,
    }),
    [
      base.brand.distribution,
      activeServer?.editable,
      effectiveConfig,
      mergedBrand.logoUrl,
      isLoading,
      loadAppearance,
    ],
  );

  return (
    <AppearanceContext.Provider value={appearanceApi}>
      <BrandContext.Provider value={mergedBrand}>{children}</BrandContext.Provider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error('useAppearance must be used inside <AppearanceProvider>.');
  }
  return value;
}
