import { DEFAULT_APPEARANCE, resolveAppearanceTokens } from '@daminatofit/brand';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppearancePreview } from './AppearancePreview';

describe('AppearancePreview', () => {
  it('applies primary color, radius and progress height from tokens', async () => {
    const tokens = resolveAppearanceTokens(
      { ...DEFAULT_APPEARANCE, styleId: 'sport', colorId: 'red' },
      'light',
    );

    const { getByTestId } = await render(<AppearancePreview tokens={tokens} />);

    const homeCard = getByTestId('appearance-home-card');
    const homeStyles = StyleSheet.flatten(homeCard.props.style);
    expect(homeStyles.borderRadius).toBe(tokens.layout.radiusLg);
    expect(homeStyles.borderWidth).toBe(tokens.layout.cardBorderWidth);

    const exerciseRow = getByTestId('appearance-exercise-row');
    const dot = exerciseRow.props.children[0];
    const dotStyle = StyleSheet.flatten(dot.props.style);
    expect(dotStyle.backgroundColor).toBe(tokens.colors.primary);

    const progress = getByTestId('appearance-progress');
    const bar = progress.props.children;
    const barStyle = StyleSheet.flatten(bar.props.style);
    expect(barStyle.height).toBe(tokens.layout.progressHeight);
    expect(barStyle.backgroundColor).toBe(tokens.colors.primary);

    const routineCard = getByTestId('appearance-routine-card');
    const routineStyles = StyleSheet.flatten(routineCard.props.style);
    expect(routineStyles.borderRadius).toBe(tokens.layout.radiusMd);
  });
});
