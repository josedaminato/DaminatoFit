import { brands } from '@daminatofit/brand';
import { render, screen } from '@testing-library/react-native';
import { BrandProvider } from '@/brand/BrandProvider';
import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it.each([brands.daminatofit, brands.pupiapp])(
    'renders the $displayName identity',
    async (brand) => {
      await render(
        <BrandProvider brand={brand}>
          <HomeScreen />
        </BrandProvider>,
      );

      expect(screen.getByRole('header')).toHaveTextContent(`Bienvenido a ${brand.displayName}`);
    },
  );

  it('shows an error when the health check fails', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));

    await render(
      <BrandProvider brand={brands.daminatofit}>
        <HomeScreen />
      </BrandProvider>,
    );

    expect(await screen.findByText(/No se pudo conectar/)).toBeOnTheScreen();
    global.fetch = originalFetch;
  });
});
