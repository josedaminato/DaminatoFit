import { DEFAULT_APPEARANCE, getBrand, resolveAppearanceTokens } from '@daminatofit/brand';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { BrandContext } from '@/brand/BrandProvider';
import type { RecommendationItem } from './api';
import { RecommendationCard, RecommendationNotice, WhatsappDraft } from './views';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

const item = (overrides: Partial<RecommendationItem> = {}): RecommendationItem => ({
  id: 'rec-1',
  tenantId: 'tenant-1',
  categorySlug: 'equipment',
  categoryName: 'Equipamiento deportivo',
  name: 'Tienda ficticia',
  description: 'Local de ejemplo',
  imageUrl: null,
  destinationKind: 'whatsapp',
  destinationUrl: 'https://wa.me/5491100000000',
  actionLabel: null,
  benefitLabel: null,
  benefitDescription: 'el descuento del 15 %',
  promoCode: 'MARTIN15',
  benefitTerms: null,
  benefitExpiresOn: null,
  benefitActive: true,
  benefitExpired: false,
  professionalLicense: null,
  licenseVerifiedByPlatform: false,
  commercialDeclared: true,
  status: 'published',
  sortOrder: 1,
  moderationHidden: false,
  trainerName: 'Martín González',
  certifiedByPlatform: false,
  ...overrides,
});

async function renderWith(ui: ReactElement, brandId: 'daminatofit' | 'pupiapp' = 'daminatofit') {
  const brand = getBrand(brandId);
  const tokens = resolveAppearanceTokens(DEFAULT_APPEARANCE, 'light');
  return await render(
    <BrandContext.Provider
      value={{
        brand,
        colors: brandId === 'pupiapp' ? brand.colors.light : tokens.colors,
        colorScheme: 'light',
        layout: tokens.layout,
        appearanceOverlay: brandId === 'daminatofit',
      }}
    >
      {ui}
    </BrandContext.Provider>,
  );
}

describe('recommendation cards', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('shows an active code and builds an editable WhatsApp draft', async () => {
    const screen = await renderWith(
      <>
        <RecommendationNotice />
        <RecommendationCard item={item()} />
        <WhatsappDraft item={item()} />
      </>,
    );
    expect(screen.getByText('MARTIN15')).toBeTruthy();
    expect(screen.queryByLabelText('Imagen de Tienda ficticia')).toBeNull();
    expect(screen.getByText(/no las certifica/i)).toBeTruthy();
    expect(screen.getByTestId('whatsapp-draft').props.value).toContain('MARTIN15');
    expect(screen.getByTestId('whatsapp-draft').props.value).toContain('Martín González');
    await fireEvent.changeText(screen.getByTestId('whatsapp-draft'), 'Hola, consulto yo');
    expect(screen.getByTestId('whatsapp-link').props.children).toContain(
      encodeURIComponent('Hola, consulto yo'),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Copiar código' }));
    const clipboard = jest.requireMock('expo-clipboard') as {
      setStringAsync: jest.Mock;
    };
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('MARTIN15');
  });

  it('does not present an expired benefit as current and keeps PupiApp colors', async () => {
    const pupi = getBrand('pupiapp');
    const screen = await renderWith(
      <RecommendationCard
        item={item({
          benefitActive: false,
          benefitExpired: true,
          promoCode: 'MARTIN15',
          benefitDescription: 'el descuento del 15 %',
          destinationKind: 'website',
          destinationUrl: 'https://tienda.example',
          imageUrl: 'https://media.example/logo.png',
        })}
      />,
      'pupiapp',
    );
    expect(screen.queryByText('MARTIN15')).toBeNull();
    expect(screen.getByLabelText('Imagen de Tienda ficticia')).toBeTruthy();
    expect(screen.getByText(/ya venció/i)).toBeTruthy();
    expect(screen.getByText('Tienda ficticia').props.style).toEqual(
      expect.objectContaining({ color: pupi.colors.light.text }),
    );
  });
});
