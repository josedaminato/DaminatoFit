import { describe, expect, it } from 'vitest';
import {
  BRAND_IDS,
  WCAG_AA_NORMAL_TEXT,
  brands,
  contrastRatio,
  getBrand,
  isBrandId,
  type ColorPalette,
} from './index';

const allBrands = BRAND_IDS.map((id) => brands[id]);

describe('brand registry', () => {
  it('registers every brand id under its own key', () => {
    for (const id of BRAND_IDS) {
      expect(brands[id].id).toBe(id);
    }
  });

  it('uses unique schemes and store identifiers per brand', () => {
    const unique = (values: string[]) => new Set(values).size === values.length;
    expect(unique(allBrands.map((b) => b.scheme))).toBe(true);
    expect(unique(allBrands.map((b) => b.ios.bundleIdentifier))).toBe(true);
    expect(unique(allBrands.map((b) => b.android.package))).toBe(true);
  });

  it.each(allBrands)('$id has valid scheme and store identifiers', (brand) => {
    expect(brand.scheme).toMatch(/^[a-z][a-z0-9+.-]*$/);
    expect(brand.ios.bundleIdentifier).toMatch(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);
    expect(brand.android.package).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  });

  it('keeps PupiApp closed to new trainers and DaminatoFit open', () => {
    expect(brands.pupiapp.trainerSignup).toBe('closed');
    expect(brands.daminatofit.trainerSignup).toBe('open');
  });

  it('resolves known brands and rejects unknown ones', () => {
    expect(getBrand('pupiapp')).toBe(brands.pupiapp);
    expect(isBrandId('appmedica')).toBe(false);
    expect(() => getBrand('appmedica')).toThrow(/Unknown brand/);
  });
});

describe('color contrast (WCAG AA)', () => {
  const textPairs: [keyof ColorPalette, keyof ColorPalette][] = [
    ['text', 'background'],
    ['text', 'surface'],
    ['textMuted', 'background'],
    ['textMuted', 'surface'],
    ['danger', 'background'],
    ['success', 'background'],
    ['onPrimary', 'primary'],
  ];

  const cases = allBrands.flatMap((brand) =>
    (['light', 'dark'] as const).flatMap((scheme) =>
      textPairs.map(([fg, bg]) => ({
        brand: brand.id,
        scheme,
        fg,
        bg,
        palette: brand.colors[scheme],
      })),
    ),
  );

  it.each(cases)('$brand/$scheme: $fg on $bg', ({ palette, fg, bg }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});
