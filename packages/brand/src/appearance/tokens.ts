import { contrastRatio, WCAG_AA_NORMAL_TEXT } from '../contrast';
import type { ColorPalette } from '../types';
import {
  APPEARANCE_COLORS,
  type AppearanceColorId,
  type AppearanceFontId,
  type AppearanceStyleId,
  type TenantAppearanceConfig,
} from './catalog';

export interface AppearanceLayoutTokens {
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  cardPadding: number;
  sectionGap: number;
  titleSize: number;
  bodySize: number;
  progressHeight: number;
  cardBorderWidth: number;
  /** Soft elevation hint for RN elevation/shadow. */
  elevation: number;
}

export interface ResolvedAppearanceTokens {
  styleId: AppearanceStyleId;
  colorId: AppearanceColorId;
  fontId: AppearanceFontId;
  logoMediaId: string | null;
  colors: ColorPalette;
  layout: AppearanceLayoutTokens;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function pickOnPrimary(primary: string): string {
  const white = '#FFFFFF';
  const nearBlack = '#0F172A';
  return contrastRatio(primary, white) >= WCAG_AA_NORMAL_TEXT ? white : nearBlack;
}

function layoutForStyle(styleId: AppearanceStyleId): AppearanceLayoutTokens {
  switch (styleId) {
    case 'minimal':
      return {
        radiusSm: 6,
        radiusMd: 10,
        radiusLg: 12,
        cardPadding: 16,
        sectionGap: 20,
        titleSize: 26,
        bodySize: 16,
        progressHeight: 6,
        cardBorderWidth: 1,
        elevation: 0,
      };
    case 'sport':
      return {
        radiusSm: 4,
        radiusMd: 8,
        radiusLg: 10,
        cardPadding: 14,
        sectionGap: 14,
        titleSize: 28,
        bodySize: 16,
        progressHeight: 10,
        cardBorderWidth: 2,
        elevation: 2,
      };
    case 'wellness':
      return {
        radiusSm: 12,
        radiusMd: 18,
        radiusLg: 24,
        cardPadding: 18,
        sectionGap: 18,
        titleSize: 26,
        bodySize: 16,
        progressHeight: 8,
        cardBorderWidth: 0,
        elevation: 1,
      };
    case 'professional':
      return {
        radiusSm: 4,
        radiusMd: 6,
        radiusLg: 8,
        cardPadding: 14,
        sectionGap: 16,
        titleSize: 24,
        bodySize: 15,
        progressHeight: 6,
        cardBorderWidth: 1,
        elevation: 0,
      };
    case 'dynamic':
      return {
        radiusSm: 10,
        radiusMd: 16,
        radiusLg: 20,
        cardPadding: 16,
        sectionGap: 16,
        titleSize: 28,
        bodySize: 16,
        progressHeight: 9,
        cardBorderWidth: 1,
        elevation: 3,
      };
  }
}

function paletteForColor(
  colorId: AppearanceColorId,
  styleId: AppearanceStyleId,
  scheme: 'light' | 'dark',
): ColorPalette {
  const primary = APPEARANCE_COLORS[colorId].hex;
  const onPrimary = pickOnPrimary(primary);
  const lum = relativeLuminance(primary);

  if (scheme === 'dark') {
    return {
      background: styleId === 'wellness' ? '#0B1220' : '#0F172A',
      surface: styleId === 'dynamic' ? '#1E293B' : '#1E293B',
      text: '#F8FAFC',
      textMuted: '#94A3B8',
      border: styleId === 'sport' ? primary : '#334155',
      primary,
      onPrimary,
      danger: '#F87171',
      success: '#4ADE80',
    };
  }

  const softBg =
    styleId === 'wellness'
      ? lum > 0.4
        ? '#F8FAFC'
        : '#F1F5F9'
      : styleId === 'minimal'
        ? '#FFFFFF'
        : '#F8FAFC';

  return {
    background: softBg,
    surface: styleId === 'professional' ? '#FFFFFF' : '#FFFFFF',
    text: '#0F172A',
    textMuted: '#64748B',
    border: styleId === 'sport' ? primary : '#E2E8F0',
    primary,
    onPrimary,
    danger: '#DC2626',
    success: '#15803D',
  };
}

export function resolveAppearanceTokens(
  config: TenantAppearanceConfig,
  scheme: 'light' | 'dark' = 'light',
): ResolvedAppearanceTokens {
  return {
    styleId: config.styleId,
    colorId: config.colorId,
    fontId: config.fontId,
    logoMediaId: config.logoMediaId,
    colors: paletteForColor(config.colorId, config.styleId, scheme),
    layout: layoutForStyle(config.styleId),
  };
}
