import { neutralDark, neutralLight } from '../palettes';
import type { BrandConfig } from '../types';

// Colors and store identifiers are placeholders until the brand identity is defined.
export const daminatofit: BrandConfig = {
  id: 'daminatofit',
  displayName: 'DaminatoFit',
  scheme: 'daminatofit',
  ios: { bundleIdentifier: 'com.example.daminatofit' },
  android: { package: 'com.example.daminatofit' },
  colors: {
    light: { ...neutralLight, primary: '#0F766E', onPrimary: '#FFFFFF' },
    dark: { ...neutralDark, primary: '#2DD4BF', onPrimary: '#042F2E' },
  },
  links: { privacyPolicy: null, terms: null, support: null },
  trainerSignup: 'open',
};
