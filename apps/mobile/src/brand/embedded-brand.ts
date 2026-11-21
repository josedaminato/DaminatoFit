import type { BrandConfig } from '@daminatofit/brand';
import Constants from 'expo-constants';

export function getEmbeddedBrand(): BrandConfig {
  const brand = Constants.expoConfig?.extra?.brand as BrandConfig | undefined;
  if (!brand) {
    throw new Error('Brand configuration missing from app config (extra.brand).');
  }
  return brand;
}
