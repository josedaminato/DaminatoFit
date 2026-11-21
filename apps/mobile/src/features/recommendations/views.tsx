import {
  DEFAULT_ACTION_LABEL,
  recommendationWhatsappMessage,
  whatsappLinkWithText,
  type RecommendationDestination,
} from '@daminatofit/contracts';
import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import type { RecommendationItem } from './api';
import { copyText } from './copy-text';

const NOTICE =
  'Las recomendaciones las elige tu entrenador. DaminatoFit no las certifica, no verifica matrículas y no participa en el acuerdo.';

export function RecommendationNotice() {
  const { colors, fontFamily } = useBrand();
  return <Text style={{ color: colors.textMuted, fontFamily: fontFamily?.regular }}>{NOTICE}</Text>;
}

export function RecommendationCard({
  item,
  onOpen,
}: {
  item: RecommendationItem;
  onOpen?: (url: string) => void;
}) {
  const { colors, layout, fontFamily } = useBrand();
  const [copied, setCopied] = useState(false);
  const action =
    item.actionLabel ??
    DEFAULT_ACTION_LABEL[item.destinationKind as RecommendationDestination] ??
    'Consultar';

  return (
    <View
      testID={`recommendation-${item.id}`}
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout?.radiusMd ?? 12,
        },
      ]}
    >
      {item.imageUrl ? (
        <Image
          accessibilityLabel={`Imagen de ${item.name}`}
          source={{ uri: item.imageUrl }}
          style={styles.image}
        />
      ) : null}
      <Text style={{ color: colors.text, fontFamily: fontFamily?.bold, fontWeight: '700' }}>
        {item.name}
      </Text>
      <Text style={{ color: colors.textMuted }}>{item.categoryName}</Text>
      {item.description ? <Text style={{ color: colors.text }}>{item.description}</Text> : null}
      {item.commercialDeclared ? (
        <Text style={{ color: colors.text }}>Beneficio acordado por el entrenador</Text>
      ) : null}
      {item.benefitActive && item.benefitDescription ? (
        <Text style={{ color: colors.text }}>{item.benefitDescription}</Text>
      ) : null}
      {item.benefitExpired ? (
        <Text style={{ color: colors.textMuted }}>El beneficio informado ya venció.</Text>
      ) : null}
      {item.benefitActive && item.promoCode ? (
        <View style={styles.row}>
          <Text testID="promo-code" style={{ color: colors.text, fontWeight: '700' }}>
            {item.promoCode}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copiar código"
            onPress={() => {
              void copyText(item.promoCode ?? '').then(() => setCopied(true));
            }}
          >
            <Text style={{ color: colors.primary }}>{copied ? 'Copiado' : 'Copiar código'}</Text>
          </Pressable>
        </View>
      ) : null}
      {item.professionalLicense ? (
        <Text style={{ color: colors.textMuted }}>
          Matrícula informada por el entrenador: {item.professionalLicense}. DaminatoFit no la
          verificó.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action}
        onPress={() => onOpen?.(item.destinationUrl)}
      >
        <Text style={{ color: colors.primary, fontFamily: fontFamily?.bold }}>{action}</Text>
      </Pressable>
    </View>
  );
}

export function WhatsappDraft({ item }: { item: RecommendationItem }) {
  const { colors } = useBrand();
  const [text, setText] = useState(() =>
    recommendationWhatsappMessage({
      trainerName: item.trainerName ?? 'tu entrenador',
      benefitDescription: item.benefitDescription,
      promoCode: item.promoCode,
      benefitActive: item.benefitActive,
    }),
  );
  if (item.destinationKind !== 'whatsapp') return null;
  const link = whatsappLinkWithText(item.destinationUrl, text);
  return (
    <View style={styles.stack}>
      <Text style={{ color: colors.text }}>Podés revisar el mensaje antes de abrir WhatsApp.</Text>
      <TextInput
        testID="whatsapp-draft"
        accessibilityLabel="Mensaje de WhatsApp"
        multiline
        value={text}
        onChangeText={setText}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      <Text testID="whatsapp-link" style={{ color: colors.textMuted }}>
        {link}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir WhatsApp"
        onPress={() => {
          if (link) void Linking.openURL(link);
        }}
      >
        <Text style={{ color: colors.primary }}>Abrir WhatsApp</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8 },
  image: { width: 72, height: 72, borderRadius: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  stack: { gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 80, padding: 12, fontSize: 16 },
});
