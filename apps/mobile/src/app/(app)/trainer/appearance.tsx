import {
  APPEARANCE_COLOR_IDS,
  APPEARANCE_COLORS,
  APPEARANCE_FONT_IDS,
  APPEARANCE_FONTS,
  APPEARANCE_STYLES,
  APPEARANCE_STYLE_IDS,
  DEFAULT_APPEARANCE,
  resolveAppearanceTokens,
  type AppearanceColorId,
  type AppearanceFontId,
  type AppearanceStyleId,
  type TenantAppearanceConfig,
} from '@daminatofit/brand';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '@/brand/AppearanceProvider';
import {
  normalizeLogoContentType,
  resetMeAppearance,
  saveMeAppearance,
  uploadLogoImage,
} from '@/brand/appearance-api';
import { useBrand } from '@/brand/BrandProvider';
import { AppearancePreview } from '@/features/appearance/AppearancePreview';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

type LocalOverride = Partial<TenantAppearanceConfig> & { localLogoUri?: string | null };

export default function TrainerAppearanceScreen() {
  const router = useRouter();
  const { colors, colorScheme } = useBrand();
  const { apiContext } = useSession();
  const { editable, appearance, logoUrl, setDraft, reload, isLoading } = useAppearance();

  const [override, setOverride] = useState<LocalOverride | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseline = appearance ?? DEFAULT_APPEARANCE;
  const styleId = (override?.styleId ?? baseline.styleId) as AppearanceStyleId;
  const colorId = (override?.colorId ?? baseline.colorId) as AppearanceColorId;
  const fontId = (override?.fontId ?? baseline.fontId) as AppearanceFontId;
  const logoMediaId =
    override && 'logoMediaId' in override ? (override.logoMediaId ?? null) : baseline.logoMediaId;
  const localLogoUri = override?.localLogoUri ?? null;

  const draftConfig = useMemo<TenantAppearanceConfig>(
    () => ({ styleId, colorId, fontId, logoMediaId }),
    [styleId, colorId, fontId, logoMediaId],
  );

  const previewTokens = useMemo(
    () => resolveAppearanceTokens(draftConfig, colorScheme),
    [draftConfig, colorScheme],
  );

  const applyLocal = useCallback(
    (patch: LocalOverride) => {
      const next: TenantAppearanceConfig = {
        styleId: (patch.styleId ?? styleId) as AppearanceStyleId,
        colorId: (patch.colorId ?? colorId) as AppearanceColorId,
        fontId: (patch.fontId ?? fontId) as AppearanceFontId,
        logoMediaId: 'logoMediaId' in patch ? (patch.logoMediaId ?? null) : logoMediaId,
      };
      setOverride((prev) => ({
        ...(prev ?? {}),
        ...patch,
        localLogoUri: 'localLogoUri' in patch ? patch.localLogoUri : (prev?.localLogoUri ?? null),
      }));
      setDraft(next);
    },
    [styleId, colorId, fontId, logoMediaId, setDraft],
  );

  const onStyle = (id: AppearanceStyleId) => applyLocal({ styleId: id });
  const onColor = (id: AppearanceColorId) => applyLocal({ colorId: id });
  const onFont = (id: AppearanceFontId) => applyLocal({ fontId: id });

  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la galería para subir el logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const contentType = normalizeLogoContentType(asset.mimeType);
    if (!contentType) {
      setError('Formato de imagen no válido. Usá JPEG, PNG o WebP.');
      return;
    }
    if (asset.fileSize == null) {
      setError('No se pudo obtener el tamaño del archivo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const id = await uploadLogoImage(apiContext, asset.uri, contentType, asset.fileSize);
      applyLocal({ logoMediaId: id, localLogoUri: asset.uri });
    } catch {
      setError('No se pudo subir el logo.');
    } finally {
      setSaving(false);
    }
  };

  const removeLogo = () => {
    applyLocal({ logoMediaId: null, localLogoUri: null });
  };

  const onCancel = () => {
    setOverride(null);
    setDraft(null);
    router.back();
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveMeAppearance(apiContext, {
        styleId,
        colorId,
        fontId,
        logoMediaId,
      });
      setOverride(null);
      setDraft(null);
      await reload();
      router.back();
    } catch {
      setError('No se pudo guardar la apariencia.');
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await resetMeAppearance(apiContext);
      setOverride({
        styleId: res.appearance.styleId,
        colorId: res.appearance.colorId,
        fontId: res.appearance.fontId,
        logoMediaId: res.appearance.logoMediaId,
        localLogoUri: null,
      });
      setDraft(res.appearance);
      await reload();
    } catch {
      setError('No se pudo restaurar los valores por defecto.');
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <Screen title="Personalizar apariencia">
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>
          La personalización visual no está disponible en esta aplicación.
        </Text>
        <Button label="Volver" onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  if (isLoading && !appearance) {
    return (
      <Screen title="Personalizar apariencia">
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      </Screen>
    );
  }

  const previewLogo = localLogoUri ?? logoUrl;

  return (
    <Screen title="Personalizar apariencia">
      <Text style={[styles.lead, { color: colors.textMuted }]}>
        Elegí estilo, color y tipografía. Los alumnos verán estos cambios en su app.
      </Text>

      <AppearancePreview tokens={previewTokens} logoUri={previewLogo} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Estilo</Text>
        <View style={styles.chipRow}>
          {APPEARANCE_STYLE_IDS.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => onStyle(id)}
              style={[
                styles.chip,
                {
                  borderColor: styleId === id ? colors.primary : colors.border,
                  backgroundColor: styleId === id ? colors.surface : colors.background,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontSize: 14 }}>
                {APPEARANCE_STYLES[id].labelEs}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Color principal</Text>
        <View style={styles.colorRow}>
          {APPEARANCE_COLOR_IDS.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={APPEARANCE_COLORS[id].labelEs}
              onPress={() => onColor(id)}
              style={[
                styles.swatch,
                {
                  backgroundColor: APPEARANCE_COLORS[id].hex,
                  borderWidth: colorId === id ? 3 : 1,
                  borderColor: colorId === id ? colors.text : colors.border,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Tipografía</Text>
        <View style={styles.chipRow}>
          {APPEARANCE_FONT_IDS.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => onFont(id)}
              style={[
                styles.chip,
                {
                  borderColor: fontId === id ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: colors.text }}>{APPEARANCE_FONTS[id].labelEs}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Logo</Text>
        {previewLogo ? (
          <Image
            source={{ uri: previewLogo }}
            style={styles.logoPreview}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={{ color: colors.textMuted }}>Sin logo</Text>
        )}
        <View style={styles.logoActions}>
          <Button label="Elegir imagen" onPress={pickLogo} variant="secondary" disabled={saving} />
          {logoMediaId || localLogoUri ? (
            <Button label="Quitar logo" onPress={removeLogo} variant="danger" disabled={saving} />
          ) : null}
        </View>
      </View>

      <ErrorText message={error} />

      <View style={styles.footer}>
        <Button label="Guardar" onPress={onSave} loading={saving} />
        <Button label="Cancelar" onPress={onCancel} variant="secondary" disabled={saving} />
        <Button
          label="Restaurar predeterminados"
          onPress={onReset}
          variant="secondary"
          disabled={saving}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  logoPreview: { width: 72, height: 72, borderRadius: 12 },
  logoActions: { gap: 8 },
  footer: { gap: 10, marginTop: 8 },
});
