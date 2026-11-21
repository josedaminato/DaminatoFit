import { brands, DEFAULT_APPEARANCE, resolveAppearanceTokens } from '@daminatofit/brand';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppearanceProvider } from '@/brand/AppearanceProvider';
import { fetchMeAppearance } from '@/brand/appearance-api';
import { BrandProvider, useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';

jest.mock('@/lib/session', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/brand/appearance-api', () => ({
  fetchMeAppearance: jest.fn(),
}));

function Probe() {
  const { colors, appearanceOverlay } = useBrand();
  return <Text testID="probe">{appearanceOverlay ? colors.primary : 'embedded'}</Text>;
}

const mockUseSession = jest.mocked(useSession);
const mockFetch = jest.mocked(fetchMeAppearance);

function sessionStub(brandId: 'daminatofit' | 'pupiapp') {
  return {
    me: null,
    activeTenantId: 't1',
    isLoading: false,
    isAuthenticated: true,
    authClient: {} as never,
    apiContext: { brandId, authClient: {} as never, activeTenantId: 't1' },
    refreshMe: jest.fn(),
    setActiveTenantId: jest.fn(),
    signOut: jest.fn(),
    activeMembership: {
      id: 'm1',
      tenantId: 't1',
      role: 'student',
      status: 'active',
      tenantName: 'Coach',
      brandId,
    },
    isTrainer: false,
    isStudent: true,
  } as ReturnType<typeof useSession>;
}

describe('AppearanceProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not overlay trainer appearance on PupiApp', async () => {
    mockUseSession.mockReturnValue(sessionStub('pupiapp'));

    const { getByTestId } = await render(
      <BrandProvider brand={brands.pupiapp}>
        <AppearanceProvider>
          <Probe />
        </AppearanceProvider>
      </BrandProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('probe')).toHaveTextContent('embedded');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('merges appearance colors on DaminatoFit when membership is active', async () => {
    const tokens = resolveAppearanceTokens({ ...DEFAULT_APPEARANCE, colorId: 'violet' }, 'light');

    mockUseSession.mockReturnValue(sessionStub('daminatofit'));

    mockFetch.mockResolvedValue({
      appearance: { ...DEFAULT_APPEARANCE, colorId: 'violet' },
      logoUrl: null,
      tokens: {
        styleId: tokens.styleId,
        colorId: 'violet',
        fontId: tokens.fontId,
        colors: tokens.colors,
        layout: tokens.layout,
      },
      editable: false,
    });

    const { getByTestId } = await render(
      <BrandProvider brand={brands.daminatofit}>
        <AppearanceProvider>
          <Probe />
        </AppearanceProvider>
      </BrandProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('probe')).toHaveTextContent(tokens.colors.primary);
    });
    expect(mockFetch).toHaveBeenCalled();
  });
});
