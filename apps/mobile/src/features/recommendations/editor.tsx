import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import type { RecommendationWriteInput } from './api';

const KINDS = [
  ['website', 'Sitio web'],
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['maps', 'Google Maps'],
  ['other', 'Otro enlace'],
] as const;

export function RecommendationEditor({
  categories,
  initial,
  saving,
  error,
  onSubmit,
}: {
  categories: { slug: string; name: string }[];
  initial?: { [K in keyof RecommendationWriteInput]?: RecommendationWriteInput[K] | null };
  saving?: boolean;
  error?: string | null;
  onSubmit: (input: RecommendationWriteInput) => void;
}) {
  const { colors } = useBrand();
  const [name, setName] = useState(initial?.name ?? '');
  const [categorySlug, setCategorySlug] = useState(
    initial?.categorySlug ?? categories[0]?.slug ?? 'other',
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [destinationKind, setDestinationKind] = useState(initial?.destinationKind ?? 'website');
  const [destinationUrl, setDestinationUrl] = useState(initial?.destinationUrl ?? '');
  const [commercial, setCommercial] = useState(initial?.commercialDeclared ?? false);
  const [benefitDescription, setBenefitDescription] = useState(initial?.benefitDescription ?? '');
  const [promoCode, setPromoCode] = useState(initial?.promoCode ?? '');
  const [benefitTerms, setBenefitTerms] = useState(initial?.benefitTerms ?? '');
  const [benefitExpiresOn, setBenefitExpiresOn] = useState(initial?.benefitExpiresOn ?? '');
  const [license, setLicense] = useState(initial?.professionalLicense ?? '');

  return (
    <View style={styles.stack}>
      <Field label="Nombre" value={name} onChangeText={setName} />
      <Text style={{ color: colors.text }}>Categoría</Text>
      <View style={styles.wrap}>
        {categories.map((category) => (
          <Pressable
            key={category.slug}
            accessibilityRole="button"
            accessibilityLabel={category.name}
            onPress={() => setCategorySlug(category.slug)}
          >
            <Text style={{ color: category.slug === categorySlug ? colors.primary : colors.text }}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field label="Descripción" value={description} onChangeText={setDescription} multiline />
      <Text style={{ color: colors.text }}>Destino</Text>
      <View style={styles.wrap}>
        {KINDS.map(([kind, label]) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => setDestinationKind(kind)}
          >
            <Text style={{ color: destinationKind === kind ? colors.primary : colors.text }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Enlace"
        value={destinationUrl}
        onChangeText={setDestinationUrl}
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <Text style={{ color: colors.text }}>Incluye un beneficio acordado</Text>
        <Switch
          accessibilityLabel="Incluye un beneficio acordado"
          value={commercial}
          onValueChange={setCommercial}
        />
      </View>
      {commercial ? (
        <>
          <Field
            label="Beneficio"
            value={benefitDescription}
            onChangeText={setBenefitDescription}
          />
          <Field
            label="Código"
            value={promoCode}
            onChangeText={setPromoCode}
            autoCapitalize="characters"
          />
          <Field label="Condiciones" value={benefitTerms} onChangeText={setBenefitTerms} />
          <Field
            label="Vencimiento (AAAA-MM-DD)"
            value={benefitExpiresOn ?? ''}
            onChangeText={setBenefitExpiresOn}
          />
        </>
      ) : null}
      <Field label="Matrícula (opcional)" value={license} onChangeText={setLicense} />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Button
        label="Guardar recomendación"
        loading={saving}
        onPress={() =>
          onSubmit({
            categorySlug,
            name: name.trim(),
            description: description.trim() || undefined,
            destinationKind,
            destinationUrl: destinationUrl.trim(),
            commercialDeclared: commercial,
            benefitDescription: commercial ? benefitDescription.trim() || undefined : undefined,
            promoCode: commercial ? promoCode.trim() || undefined : undefined,
            benefitTerms: commercial ? benefitTerms.trim() || undefined : undefined,
            benefitExpiresOn: commercial && benefitExpiresOn ? benefitExpiresOn : null,
            professionalLicense: license.trim() || undefined,
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
