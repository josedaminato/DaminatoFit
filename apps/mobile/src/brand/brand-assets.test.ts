import { BRAND_IDS } from '@daminatofit/brand';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_ASSETS = [
  'icon.png',
  'android-icon-foreground.png',
  'android-icon-background.png',
  'android-icon-monochrome.png',
];

describe('brand assets', () => {
  it.each(BRAND_IDS)('%s ships every asset referenced by app.config.ts', (brandId) => {
    const dir = join(__dirname, '..', '..', 'assets', 'brands', brandId);
    const missing = REQUIRED_ASSETS.filter((file) => !existsSync(join(dir, file)));
    expect(missing).toEqual([]);
  });
});
