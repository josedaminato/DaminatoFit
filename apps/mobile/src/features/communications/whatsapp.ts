import { Linking } from 'react-native';

const E164 = /^\+[1-9]\d{7,14}$/;

/** https://wa.me opens WhatsApp when it is installed and the browser otherwise. */
export function whatsappUrl(e164: string | null | undefined): string | null {
  if (!e164 || !E164.test(e164)) return null;
  return `https://wa.me/${e164.slice(1)}`;
}

export async function openWhatsapp(
  url: string | null,
): Promise<'opened' | 'missing' | 'unavailable'> {
  if (!url) return 'missing';
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'unavailable';
  }
}
