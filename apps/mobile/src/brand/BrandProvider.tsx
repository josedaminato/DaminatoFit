import type { BrandConfig, ColorPalette } from '@daminatofit/brand';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getEmbeddedBrand } from './embedded-brand';

interface BrandContextValue {
  brand: BrandConfig;
  colors: ColorPalette;
  colorScheme: 'light' | 'dark';
}

const BrandContext = createContext<BrandContextValue | null>(null);

interface BrandProviderProps {
  children: ReactNode;
  /** Defaults to the brand embedded at build time. */
  brand?: BrandConfig;
}

export function BrandProvider({ children, brand }: BrandProviderProps) {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const resolved = brand ?? getEmbeddedBrand();

  const value = useMemo<BrandContextValue>(
    () => ({ brand: resolved, colors: resolved.colors[colorScheme], colorScheme }),
    [resolved, colorScheme],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const value = useContext(BrandContext);
  if (!value) {
    throw new Error('useBrand must be used inside <BrandProvider>.');
  }
  return value;
}
