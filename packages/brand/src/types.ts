export const BRAND_IDS = ['daminatofit', 'pupiapp'] as const;

export type BrandId = (typeof BRAND_IDS)[number];

/** A realm is a set of apps that share user accounts. Accounts never cross realms. */
export const REALM_IDS = ['daminatofit', 'pupiapp'] as const;

export type RealmId = (typeof REALM_IDS)[number];

/**
 * `platform`: lives inside the DaminatoFit app.
 * `standalone`: its own store binary, published by the content owner.
 */
export type Distribution = 'platform' | 'standalone';

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
  /** `null` until the legal pages exist. Support can be a mailto before a public page exists. */
  links: {
    privacyPolicy: string | null;
    terms: string | null;
    support: string | null;
    supportEmail: string | null;
    /** E.164. Argentine mobiles include the 9 after the country code. */
    supportPhoneE164: string | null;
  };
  distribution: Distribution;
  authRealm: RealmId;
  /** `closed`: the brand belongs to a single trainer and no new trainers can sign up. */
  trainerSignup: 'open' | 'closed';
  /** Mirrors `brands.max_tenants` in the database, which is what enforces it. `null` = unlimited. */
  maxTenants: number | null;
}
