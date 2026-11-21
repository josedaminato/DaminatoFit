import { APPEARANCE_FONT_IDS, APPEARANCE_FONTS } from '@daminatofit/brand';
import { fontFamiliesForId } from './fonts';

describe('fontFamiliesForId', () => {
  it.each(APPEARANCE_FONT_IDS)('maps %s to expo font keys from catalogue', (fontId) => {
    const families = fontFamiliesForId(fontId);
    const expected = APPEARANCE_FONTS[fontId].expoFontKeys;
    expect(families.regular).toBe(expected.regular);
    expect(families.medium).toBe(expected.medium);
    expect(families.bold).toBe(expected.bold);
  });
});
