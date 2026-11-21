import type { ColorPalette } from './types';

type NeutralPalette = Omit<ColorPalette, 'primary' | 'onPrimary'>;

export const neutralLight: NeutralPalette = {
  background: '#FFFFFF',
  surface: '#F4F4F5',
  text: '#18181B',
  textMuted: '#52525B',
  border: '#D4D4D8',
  danger: '#B91C1C',
  success: '#15803D',
};

export const neutralDark: NeutralPalette = {
  background: '#09090B',
  surface: '#18181B',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  border: '#3F3F46',
  danger: '#F87171',
  success: '#4ADE80',
};
