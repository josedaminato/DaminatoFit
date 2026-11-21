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

  it('tells the user when the API URL is not configured', async () => {
    await render(
      <BrandProvider brand={brands.daminatofit}>
        <HomeScreen />
      </BrandProvider>,
    );

    expect(screen.getByText(/API sin configurar/)).toBeOnTheScreen();
  });
});
