import { StyleSheet, Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';

export function ErrorText({ message }: { message: string | null | undefined }) {
  const { colors } = useBrand();
  if (!message) return null;

  return (
    <Text accessibilityRole="alert" style={[styles.text, { color: colors.danger }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 21 },
});
