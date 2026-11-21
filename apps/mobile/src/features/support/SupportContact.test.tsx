import { getBrand } from '@daminatofit/brand';
import { cleanup, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { BrandContext } from '@/brand/BrandProvider';
import { SupportContact } from './SupportContact';

function renderWith(ui: ReactElement, brandId: 'daminatofit' | 'pupiapp') {
  const brand = getBrand(brandId);
  return render(
    <BrandContext.Provider value={{ brand, colors: brand.colors.light, colorScheme: 'light' }}>
      {ui}
    </BrandContext.Provider>,
  );
}

describe('support contact', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('shows the DaminatoFit email and local phone', async () => {
    const view = await renderWith(<SupportContact />, 'daminatofit');
    expect(view.getByText('info@daminatofit.com')).toBeTruthy();
    expect(view.getByText('WhatsApp 11 2765-4198')).toBeTruthy();
  });

  it('stays empty for PupiApp', async () => {
    const view = await renderWith(<SupportContact />, 'pupiapp');
    expect(view.queryByText(/Contacto/)).toBeNull();
  });
});
