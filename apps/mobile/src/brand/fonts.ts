import { APPEARANCE_FONTS, type AppearanceFontId } from '@daminatofit/brand';
import {
  BarlowCondensed_400Regular,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  SourceSerif4_400Regular,
  SourceSerif4_600SemiBold,
  SourceSerif4_700Bold,
} from '@expo-google-fonts/source-serif-4';
import { useFonts } from 'expo-font';

export interface AppearanceFontFamilies {
  regular: string;
  medium: string;
  bold: string;
}

export function fontFamiliesForId(fontId: AppearanceFontId): AppearanceFontFamilies {
  const keys = APPEARANCE_FONTS[fontId].expoFontKeys;
  return { regular: keys.regular, medium: keys.medium, bold: keys.bold };
}

const APPEARANCE_FONT_MAP = {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  SourceSerif4_400Regular,
  SourceSerif4_600SemiBold,
  SourceSerif4_700Bold,
  BarlowCondensed_400Regular,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  CormorantGaramond_400Regular,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_700Bold,
} as const;

export function useAppearanceFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts(APPEARANCE_FONT_MAP);
  return { loaded, error: error ?? null };
}
