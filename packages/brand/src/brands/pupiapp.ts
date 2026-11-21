import { neutralDark, neutralLight } from '../palettes';
import type { BrandConfig } from '../types';

// Colors and store identifiers are placeholders until the brand identity is defined.
export const pupiapp: BrandConfig = {
  id: 'pupiapp',
  displayName: 'PupiApp',
  scheme: 'pupiapp',
  ios: { bundleIdentifier: 'com.example.pupiapp' },
  android: { package: 'com.example.pupiapp' },
  colors: {
    light: { ...neutralLight, primary: '#7C3AED', onPrimary: '#FFFFFF' },
    dark: { ...neutralDark, primary: '#A78BFA', onPrimary: '#1E1B4B' },
  },
  links: { privacyPolicy: null, terms: null, support: null },
  trainerSignup: 'closed',
};
