import 'tsx/cjs';
import { getBrand } from '@daminatofit/brand';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const brand = getBrand(process.env.APP_BRAND ?? 'daminatofit');
const assets = `./assets/brands/${brand.id}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.displayName,
  slug: brand.id,
  scheme: brand.scheme,
  version: '0.1.0',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: `${assets}/icon.png`,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: brand.ios.bundleIdentifier,
    supportsTablet: false,
  },
  android: {
    package: brand.android.package,
    adaptiveIcon: {
      backgroundColor: brand.colors.light.primary,
      foregroundImage: `${assets}/android-icon-foreground.png`,
      backgroundImage: `${assets}/android-icon-background.png`,
      monochromeImage: `${assets}/android-icon-monochrome.png`,
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: ['expo-router', 'expo-notifications'],
  experiments: {
    typedRoutes: true,
  },
  // Only the active brand is embedded, so each binary carries just its own identity.
  extra: {
    brand,
  },
});
