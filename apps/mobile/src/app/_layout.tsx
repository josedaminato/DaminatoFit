import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BrandProvider } from '@/brand/BrandProvider';
import { SessionProvider } from '@/lib/session';

export default function RootLayout() {
  return (
    <BrandProvider>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </SessionProvider>
    </BrandProvider>
  );
}
