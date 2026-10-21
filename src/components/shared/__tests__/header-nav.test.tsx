import React from 'react';
import { render, screen } from '@testing-library/react-native';

import HeaderNav from '@/src/components/shared/header-nav';

jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return {
    ThemeContext: createContext({
      theme: { isDark: true, colors: { headerBg: '#000', headerText: '#fff' } },
    }),
  };
});
// Both rely on the automatic JSX runtime; ts-jest compiles with the classic one.
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const LONG_NAME = 'Maximiliana Celestine Rivera-Montgomery';

/**
 * The bar is a fixed height on purpose: it is absolutely positioned and the
 * screens pad their content by the same constant. So large text has to fit the
 * bar rather than grow it — scale up to a cap, then shrink, never truncate.
 */
describe('HeaderNav', () => {
  it('fits a long title into the bar instead of cutting it off', () => {
    render(<HeaderNav title={LONG_NAME} />);

    const title = screen.getByRole('header', { name: LONG_NAME });
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('does the same for a text side button', () => {
    render(<HeaderNav title="Edit" leftLabel="Cancel" onLeftPress={jest.fn()} />);

    const label = screen.getByText('Cancel');
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('keeps an empty side slot out of the screen-reader order', () => {
    render(<HeaderNav title="Transits" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
