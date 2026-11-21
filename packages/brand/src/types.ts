export const BRAND_IDS = ['daminatofit', 'pupiapp'] as const;

export type BrandId = (typeof BRAND_IDS)[number];

export interface ColorPalette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
}

export interface BrandConfig {
  id: BrandId;
  displayName: string;
  /** Deep link scheme, e.g. `daminatofit://`. */
  scheme: string;
  /** Store identifiers cannot be changed once an app is published. */
  ios: { bundleIdentifier: string };
  android: { package: string };
  colors: { light: ColorPalette; dark: ColorPalette };
  /** `null` until the legal and support pages exist. */
  links: {
    privacyPolicy: string | null;
    terms: string | null;
    support: string | null;
  };
  /** `closed`: the brand belongs to a single trainer and no new trainers can sign up. */
  trainerSignup: 'open' | 'closed';
}
