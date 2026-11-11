import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { logEvent } from '@react-native-firebase/analytics';

import TransitsScreen from '@/app/(main)/transits';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import type { TransitReadingResult } from '@/src/types/transit-reading.types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const presentPaywall = jest.fn(() => Promise.resolve(false));

// The real contexts pull in Firebase and the RevenueCat native modules.
jest.mock('@/src/context/horoscope-context', () => ({ useHoroscope: jest.fn() }));
jest.mock('@/src/context/revenuecat-context', () => ({ useRevenueCat: jest.fn() }));
jest.mock('@/src/hooks/use-screen-perf-log', () => ({
  useScreenPerfLog: () => ({ markReady: jest.fn() }),
}));

jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/skeleton-lines', () => () => null);
// Both rely on the automatic JSX runtime; ts-jest compiles with the classic one.
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const READING: TransitReadingResult = {
  retrogradesActive: ['Mars'],
  houses: [
    {
      house: '1',
      interpretation: 'A **bold** start to the week.',
      natalDegree: '',
      natalSign: '',
      transits: [{ name: 'Mars', degree: '12°', sign: 'Leo' }],
    },
    {
      house: '5',
      interpretation: 'Romance is in the air.',
      natalDegree: '',
      natalSign: '',
      transits: [],
    },
  ],
};

const setHoroscope = (overrides: Partial<ReturnType<typeof useHoroscope>> = {}) =>
  (useHoroscope as jest.Mock).mockReturnValue({
    transitReading: READING,
    transitReadingGenerating: false,
    // Sun and Moon in house 1, so a free user has houses 1 open and 5 locked.
    chartDetails: { planets: [{ name: 'Sun', house: 1 }, { name: 'Moon', house: 1 }] },
    loading: false,
    ...overrides,
  });

const houseCard = (n: number) =>
  screen.getByRole('button', { name: new RegExp(`^House ${n}(?!\\d)`) });

describe('TransitsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHoroscope();
    (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: false, loading: false, presentPaywall });
  });

  // The chevron was an icon, so whether a card was open was never spoken.
  it('reports an unlocked house card as collapsed, then expanded', () => {
    render(<TransitsScreen />);

    expect(houseCard(1).props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(houseCard(1));
    expect(houseCard(1).props.accessibilityState?.expanded).toBe(true);
  });

  it('says a locked house is premium rather than expandable', () => {
    render(<TransitsScreen />);

    const locked = houseCard(5);
    expect(locked.props.accessibilityHint).toBe('Premium. Opens upgrade options');
    // No expanded state: it can't expand, so announcing "collapsed" would mislead.
    expect(locked.props.accessibilityState?.expanded).toBeUndefined();

    fireEvent.press(locked);
    // Opened in place, not via the spinner route, so closing it lands straight back here.
    expect(presentPaywall).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  describe('analytics', () => {
    const events = (name: string) =>
      (logEvent as jest.Mock).mock.calls.filter(([, n]) => n === name).map(([, , p]) => p);

    it('reports a house card opening and closing', () => {
      render(<TransitsScreen />);
      fireEvent.press(houseCard(1));
      fireEvent.press(houseCard(1));

      expect(events('ui_interaction')).toEqual([
        { screen: 'transits', feature: 'house_card', action: 'expand', item: 'house_1' },
        { screen: 'transits', feature: 'house_card', action: 'collapse', item: 'house_1' },
      ]);
    });

    it('reports a locked house as an unlock, not an expand', () => {
      render(<TransitsScreen />);
      fireEvent.press(houseCard(5));

      expect(events('ui_interaction')).toEqual([
        { screen: 'transits', feature: 'house_card', action: 'unlock', item: 'house_5' },
      ]);
    });

    it('counts the reading as viewed once, and not while it is loading', () => {
      setHoroscope({ loading: true });
      const { rerender } = render(<TransitsScreen />);
      expect(events('transits_viewed')).toHaveLength(0);

      setHoroscope();
      rerender(<TransitsScreen />);
      rerender(<TransitsScreen />);
      expect(events('transits_viewed')).toHaveLength(1);
    });
  });

  // "Rx" was read as the letters R X.
  it('speaks a retrograde planet as retrograde', () => {
    render(<TransitsScreen />);

    expect(screen.getByLabelText('Mars, retrograde')).toBeTruthy();
  });

  it('tells a screen reader the reading is still loading', () => {
    setHoroscope({ loading: true, transitReading: null });
    render(<TransitsScreen />);

    expect(screen.getAllByLabelText('Loading house reading')).toHaveLength(12);
  });
});
