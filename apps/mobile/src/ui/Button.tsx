import React, { forwardRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  accessibilityHint?: string;
  children?: ReactNode;
}

export const Button = forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(function Button(
  { label, onPress, disabled, loading, variant = 'primary', accessibilityHint },
  ref,
) {
  const { colors } = useBrand();
  const isDisabled = disabled || loading;

  let backgroundColor = colors.primary;
  let textColor = colors.onPrimary;
  let borderColor = colors.primary;

  if (variant === 'secondary') {
    backgroundColor = colors.surface;
    textColor = colors.text;
    borderColor = colors.border;
  } else if (variant === 'danger') {
    backgroundColor = colors.danger;
    textColor = colors.onPrimary;
    borderColor = colors.danger;
  }

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: '600' },
});
