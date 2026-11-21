import { daminatofit } from './brands/daminatofit';
import { pupiapp } from './brands/pupiapp';
import { BRAND_IDS, type BrandConfig, type BrandId, type RealmId } from './types';

export * from './types';
export * from './contrast';
export * from './appearance/catalog';
export * from './appearance/tokens';

export const brands: Readonly<Record<BrandId, BrandConfig>> = { daminatofit, pupiapp };

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === 'string' && (BRAND_IDS as readonly string[]).includes(value);
}

export function getBrand(id: string): BrandConfig {
  if (!isBrandId(id)) {
    throw new Error(`Unknown brand "${id}". Expected one of: ${BRAND_IDS.join(', ')}`);
  }
  return brands[id];
}

export function realmForBrand(id: BrandId): RealmId {
  return brands[id].authRealm;
}
