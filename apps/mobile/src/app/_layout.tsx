import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppearanceProvider } from '@/brand/AppearanceProvider';
import { BrandProvider } from '@/brand/BrandProvider';
import { FontsGate } from '@/brand/FontsGate';
import { SessionProvider } from '@/lib/session';

export default function RootLayout() {
  return (
    <BrandProvider>
      <SessionProvider>
        <AppearanceProvider>
          <FontsGate>
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="auto" />
          </FontsGate>
        </AppearanceProvider>
      </SessionProvider>
    </BrandProvider>
  );
}
