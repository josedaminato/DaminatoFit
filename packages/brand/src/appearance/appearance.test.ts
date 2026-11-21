import { describe, expect, it } from 'vitest';
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from '../contrast';
import {
  APPEARANCE_COLOR_IDS,
  APPEARANCE_COLORS,
  APPEARANCE_FONT_IDS,
  APPEARANCE_STYLE_IDS,
  DEFAULT_APPEARANCE,
  parseTenantAppearance,
} from './catalog';
import { resolveAppearanceTokens } from './tokens';

describe('appearance catalogue', () => {
  it('exposes five styles, ten colors and five fonts', () => {
    expect(APPEARANCE_STYLE_IDS).toHaveLength(5);
    expect(APPEARANCE_COLOR_IDS).toHaveLength(10);
    expect(APPEARANCE_FONT_IDS).toHaveLength(5);
  });

  it('uses the documented primary hex values', () => {
    expect(APPEARANCE_COLORS.turquoise.hex).toBe('#0D9488');
    expect(APPEARANCE_COLORS.blue.hex).toBe('#2563EB');
    expect(APPEARANCE_COLORS.gold.hex).toBe('#A16207');
  });

  it('parses unknown values to defaults', () => {
    expect(parseTenantAppearance({ styleId: 'nope', colorId: 'x' })).toEqual({
      ...DEFAULT_APPEARANCE,
      updatedAt: undefined,
    });
  });

  it('resolves tokens that screens can consume (radius + primary)', () => {
    for (const styleId of APPEARANCE_STYLE_IDS) {
      for (const colorId of APPEARANCE_COLOR_IDS) {
        const tokens = resolveAppearanceTokens({
          styleId,
          colorId,
          fontId: 'modern',
          logoMediaId: null,
        });
        expect(tokens.layout.radiusMd).toBeGreaterThan(0);
        expect(tokens.colors.primary).toBe(APPEARANCE_COLORS[colorId].hex);
        expect(
          contrastRatio(tokens.colors.primary, tokens.colors.onPrimary),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        expect(tokens.colors.danger).toBeTruthy();
        expect(tokens.colors.success).toBeTruthy();
      }
    }
  });

  it('differentiates style layout tokens', () => {
    const minimal = resolveAppearanceTokens({ ...DEFAULT_APPEARANCE, styleId: 'minimal' });
    const wellness = resolveAppearanceTokens({ ...DEFAULT_APPEARANCE, styleId: 'wellness' });
    const sport = resolveAppearanceTokens({ ...DEFAULT_APPEARANCE, styleId: 'sport' });
    expect(wellness.layout.radiusLg).toBeGreaterThan(minimal.layout.radiusLg);
    expect(sport.layout.progressHeight).toBeGreaterThan(minimal.layout.progressHeight);
  });
});
