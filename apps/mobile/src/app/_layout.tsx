import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BrandProvider } from '@/brand/BrandProvider';

export default function RootLayout() {
  return (
    <BrandProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </BrandProvider>
  );
}
