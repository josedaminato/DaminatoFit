import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { openWhatsapp, whatsappUrl } from '@/features/communications/whatsapp';

function displayPhone(e164: string): string {
  const digits = e164.replace(/^\+54/, '');
  const local = digits.startsWith('9') ? digits.slice(1) : digits;
  if (local.length === 10) return `${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  return e164;
}

export function SupportContact() {
  const { brand, colors } = useBrand();
  const email = brand.links.supportEmail;
  const phone = brand.links.supportPhoneE164;
  const whatsapp = whatsappUrl(phone);
  if (!email && !whatsapp) return null;

  return (
    <View style={styles.block}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>Contacto de {brand.displayName}</Text>
      {email ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Escribir a ${email}`}
          onPress={() => {
            void Linking.openURL(`mailto:${email}`);
          }}
        >
          <Text style={{ color: colors.primary }}>{email}</Text>
        </Pressable>
      ) : null}
      {whatsapp && phone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`WhatsApp ${displayPhone(phone)}`}
          onPress={() => {
            void openWhatsapp(whatsapp);
          }}
        >
          <Text style={{ color: colors.primary }}>WhatsApp {displayPhone(phone)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
});
