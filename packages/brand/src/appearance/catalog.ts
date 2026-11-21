/** Trainer visual appearance catalogue (Phase 5.1). Shared by API validation and mobile tokens. */

export const APPEARANCE_STYLE_IDS = [
  'minimal',
  'sport',
  'wellness',
  'professional',
  'dynamic',
] as const;

export type AppearanceStyleId = (typeof APPEARANCE_STYLE_IDS)[number];

export const APPEARANCE_COLOR_IDS = [
  'turquoise',
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'green',
  'navy',
  'graphite',
  'gold',
] as const;

export type AppearanceColorId = (typeof APPEARANCE_COLOR_IDS)[number];

export const APPEARANCE_FONT_IDS = ['modern', 'classic', 'sport', 'elegant', 'compact'] as const;

export type AppearanceFontId = (typeof APPEARANCE_FONT_IDS)[number];

export const APPEARANCE_COLORS: Record<AppearanceColorId, { hex: string; labelEs: string }> = {
  turquoise: { hex: '#0D9488', labelEs: 'Turquesa' },
  blue: { hex: '#2563EB', labelEs: 'Azul' },
  violet: { hex: '#7C3AED', labelEs: 'Violeta' },
  pink: { hex: '#DB2777', labelEs: 'Rosa' },
  red: { hex: '#DC2626', labelEs: 'Rojo' },
  orange: { hex: '#EA580C', labelEs: 'Naranja' },
  green: { hex: '#15803D', labelEs: 'Verde' },
  navy: { hex: '#1E3A8A', labelEs: 'Azul marino' },
  graphite: { hex: '#334155', labelEs: 'Grafito' },
  gold: { hex: '#A16207', labelEs: 'Dorado' },
};

export const APPEARANCE_STYLES: Record<
  AppearanceStyleId,
  { labelEs: string; descriptionEs: string }
> = {
  minimal: {
    labelEs: 'Minimalista',
    descriptionEs: 'Interfaz limpia, espacios amplios y jerarquía clara.',
  },
  sport: {
    labelEs: 'Deportivo',
    descriptionEs: 'Alto contraste y progreso visible.',
  },
  wellness: {
    labelEs: 'Wellness',
    descriptionEs: 'Suave, redondeado y calmado.',
  },
  professional: {
    labelEs: 'Profesional',
    descriptionEs: 'Sobrio, ordenado y legible.',
  },
  dynamic: {
    labelEs: 'Dinámico',
    descriptionEs: 'Expresivo y moderno, sin perder legibilidad.',
  },
};

/**
 * Bundled OFL/Apache fonts (via @expo-google-fonts at build time — not runtime CDN).
 * Licenses: SIL OFL 1.1 (DM Sans, Source Serif 4, Barlow Condensed, Cormorant Garamond)
 * and SIL OFL / Apache-compatible IBM Plex Sans.
 */
export const APPEARANCE_FONTS: Record<
  AppearanceFontId,
  {
    labelEs: string;
    familyLabel: string;
    license: string;
    /** Logical keys consumed by the mobile font loader. */
    expoFontKeys: { regular: string; medium: string; bold: string };
  }
> = {
  modern: {
    labelEs: 'Moderna',
    familyLabel: 'DM Sans',
    license: 'SIL Open Font License 1.1',
    expoFontKeys: {
      regular: 'DMSans_400Regular',
      medium: 'DMSans_500Medium',
      bold: 'DMSans_700Bold',
    },
  },
  classic: {
    labelEs: 'Clásica',
    familyLabel: 'Source Serif 4',
    license: 'SIL Open Font License 1.1',
    expoFontKeys: {
      regular: 'SourceSerif4_400Regular',
      medium: 'SourceSerif4_600SemiBold',
      bold: 'SourceSerif4_700Bold',
    },
  },
  sport: {
    labelEs: 'Deportiva',
    familyLabel: 'Barlow Condensed',
    license: 'SIL Open Font License 1.1',
    expoFontKeys: {
      regular: 'BarlowCondensed_400Regular',
      medium: 'BarlowCondensed_600SemiBold',
      bold: 'BarlowCondensed_700Bold',
    },
  },
  elegant: {
    labelEs: 'Elegante',
    familyLabel: 'Cormorant Garamond',
    license: 'SIL Open Font License 1.1',
    expoFontKeys: {
      regular: 'CormorantGaramond_400Regular',
      medium: 'CormorantGaramond_600SemiBold',
      bold: 'CormorantGaramond_700Bold',
    },
  },
  compact: {
    labelEs: 'Compacta',
    familyLabel: 'IBM Plex Sans',
    license: 'SIL Open Font License 1.1',
    expoFontKeys: {
      regular: 'IBMPlexSans_400Regular',
      medium: 'IBMPlexSans_500Medium',
      bold: 'IBMPlexSans_700Bold',
    },
  },
};

export const DEFAULT_APPEARANCE = {
  styleId: 'minimal' as AppearanceStyleId,
  colorId: 'turquoise' as AppearanceColorId,
  fontId: 'modern' as AppearanceFontId,
  logoMediaId: null as string | null,
};

export interface TenantAppearanceConfig {
  styleId: AppearanceStyleId;
  colorId: AppearanceColorId;
  fontId: AppearanceFontId;
  logoMediaId: string | null;
  updatedAt?: string;
}

export function isAppearanceStyleId(value: unknown): value is AppearanceStyleId {
  return typeof value === 'string' && (APPEARANCE_STYLE_IDS as readonly string[]).includes(value);
}

export function isAppearanceColorId(value: unknown): value is AppearanceColorId {
  return typeof value === 'string' && (APPEARANCE_COLOR_IDS as readonly string[]).includes(value);
}

export function isAppearanceFontId(value: unknown): value is AppearanceFontId {
  return typeof value === 'string' && (APPEARANCE_FONT_IDS as readonly string[]).includes(value);
}

export function parseTenantAppearance(raw: unknown): TenantAppearanceConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    styleId: isAppearanceStyleId(obj.styleId) ? obj.styleId : DEFAULT_APPEARANCE.styleId,
    colorId: isAppearanceColorId(obj.colorId) ? obj.colorId : DEFAULT_APPEARANCE.colorId,
    fontId: isAppearanceFontId(obj.fontId) ? obj.fontId : DEFAULT_APPEARANCE.fontId,
    logoMediaId: typeof obj.logoMediaId === 'string' ? obj.logoMediaId : null,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  };
}
