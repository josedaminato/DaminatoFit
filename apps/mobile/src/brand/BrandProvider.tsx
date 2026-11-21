import type {
  AppearanceLayoutTokens,
  AppearanceStyleId,
  BrandConfig,
  ColorPalette,
} from '@daminatofit/brand';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { AppearanceFontFamilies } from '@/brand/fonts';
import { getEmbeddedBrand } from './embedded-brand';

export interface BrandContextValue {
  brand: BrandConfig;
  colors: ColorPalette;
  colorScheme: 'light' | 'dark';
  layout?: AppearanceLayoutTokens;
  fontFamily?: AppearanceFontFamilies;
  logoUrl?: string | null;
  styleId?: AppearanceStyleId;
  /** True when trainer appearance tokens override embedded palette. */
  appearanceOverlay?: boolean;
}

export const BrandContext = createContext<BrandContextValue | null>(null);

interface BrandProviderProps {
  children: ReactNode;
  /** Defaults to the brand embedded at build time. */
  brand?: BrandConfig;
}

export function BrandProvider({ children, brand }: BrandProviderProps) {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const resolved = brand ?? getEmbeddedBrand();

  const value = useMemo<BrandContextValue>(
    () => ({
      brand: resolved,
      colors: resolved.colors[colorScheme],
      colorScheme,
      appearanceOverlay: false,
    }),
    [resolved, colorScheme],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

/** Reads the innermost brand context (base or appearance-merged). */
export function useBrand(): BrandContextValue {
  const value = useContext(BrandContext);
  if (!value) {
    throw new Error('useBrand must be used inside <BrandProvider>.');
  }
  return value;
}

/** Base brand from the root provider only — used by AppearanceProvider to merge tokens. */
export function useBrandBase(): BrandContextValue {
  const value = useContext(BrandContext);
  if (!value) {
    throw new Error('useBrandBase must be used inside <BrandProvider>.');
  }
  return value;
}
