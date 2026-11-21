import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrand } from '@/brand/BrandProvider';

interface ScreenProps {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
}

export function Screen({ title, children, scroll = true }: ScreenProps) {
  const { colors } = useBrand();
  const content = (
    <View style={styles.inner}>
      {title ? (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24 },
  inner: { flex: 1, padding: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
});
