import type { ResolvedAppearanceTokens } from '@daminatofit/brand';
import { APPEARANCE_FONTS } from '@daminatofit/brand';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fontFamiliesForId } from '@/brand/fonts';

export interface AppearancePreviewProps {
  tokens: Pick<ResolvedAppearanceTokens, 'colors' | 'layout' | 'fontId'>;
  logoUri?: string | null;
  testID?: string;
}

export function AppearancePreview({
  tokens,
  logoUri,
  testID = 'appearance-preview',
}: AppearancePreviewProps) {
  const { colors, layout, fontId } = tokens;
  const fonts = fontFamiliesForId(fontId);
  const progressPct = 0.62;

  return (
    <View style={styles.wrap} testID={testID}>
      <View
        style={[
          styles.homeCard,
          {
            backgroundColor: colors.surface,
            borderRadius: layout.radiusLg,
            borderWidth: layout.cardBorderWidth,
            borderColor: colors.border,
            padding: layout.cardPadding,
          },
        ]}
        testID="appearance-home-card"
      >
        <View style={styles.homeHeader}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logo} accessibilityIgnoresInvertColors />
          ) : (
            <View
              style={[
                styles.logoPlaceholder,
                { backgroundColor: colors.primary, borderRadius: layout.radiusSm },
              ]}
            >
              <Text
                style={{
                  color: colors.onPrimary,
                  fontFamily: fonts.bold,
                  fontSize: layout.bodySize - 2,
                }}
              >
                Logo
              </Text>
            </View>
          )}
          <Text
            style={{
              color: colors.text,
              fontFamily: fonts.bold,
              fontSize: layout.titleSize - 6,
            }}
          >
            Inicio
          </Text>
        </View>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: fonts.regular,
            fontSize: layout.bodySize - 1,
          }}
        >
          Vista previa del estudio
        </Text>
      </View>

      <View
        style={[
          styles.routineCard,
          {
            backgroundColor: colors.surface,
            borderRadius: layout.radiusMd,
            borderWidth: layout.cardBorderWidth,
            borderColor: colors.border,
            padding: layout.cardPadding,
            gap: layout.sectionGap / 2,
          },
        ]}
        testID="appearance-routine-card"
      >
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: layout.bodySize + 2 }}>
          Rutina — piernas
        </Text>
        <View
          style={[
            styles.exerciseRow,
            {
              borderRadius: layout.radiusSm,
              borderColor: colors.border,
              borderWidth: layout.cardBorderWidth,
            },
          ]}
          testID="appearance-exercise-row"
        >
          <View style={[styles.exerciseDot, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.text, fontFamily: fonts.medium, fontSize: layout.bodySize }}
            >
              Sentadilla
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: fonts.regular,
                fontSize: layout.bodySize - 2,
              }}
            >
              3 × 10
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack} testID="appearance-progress">
          <View
            style={{
              height: layout.progressHeight,
              width: `${progressPct * 100}%`,
              backgroundColor: colors.primary,
              borderRadius: layout.radiusSm,
            }}
          />
        </View>
      </View>

      <Text
        style={styles.meta}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {APPEARANCE_FONTS[fontId].familyLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  homeCard: { gap: 8 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 40, height: 40, borderRadius: 8 },
  logoPlaceholder: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineCard: {},
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  exerciseDot: { width: 10, height: 10, borderRadius: 5 },
  progressTrack: {
    width: '100%',
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  meta: { fontSize: 1, height: 1, opacity: 0 },
});
