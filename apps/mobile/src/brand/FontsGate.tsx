import { useAppearanceFonts } from '@/brand/fonts';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function FontsGate({ children }: { children: ReactNode }) {
  const { loaded } = useAppearanceFonts();

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
