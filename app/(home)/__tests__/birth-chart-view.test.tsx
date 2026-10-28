import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import BirthChartScreen from '@/app/(home)/birth-chart-view';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const BREAKDOWN: NatalChartBreakdownResult = {
  personalitySnapshot: 'You lead with **fire**.',
  teaser: 'Big things ahead.',
  houses: [
    { house: '1', sign: 'Aries', degree: '12°', planets: [], interpretation: 'House one reading.', locked: false },
    { house: '5', sign: 'Leo', degree: '3°', planets: [], interpretation: 'House five reading.', locked: false },
  ],
  planets: [
    { name: 'Venus', sign: 'Pisces', degree: '20°', house: '12', retrograde: false, interpretation: 'PREMIUM_VENUS_READING' },
  ],
  aspects: [],
};

// Stable values, as the real providers give — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/horoscope-context', () => {
  // Inside the factory: jest.mock is hoisted above anything declared in the file.
  const planet = (name: string, sign: string, house: number, isRetrograde = false) => ({
    name, symbol: '•', longitude: 0, sign, signSymbol: '', degree: 12,
    minutes: 0, seconds: 0, speed: 1, isRetrograde, house,
  });
  const value = {
    // Sun and Moon in house 1, so a free user has house 1 open and house 5 locked.
    chartDetails: {
      planets: [planet('Sun', 'Aries', 1), planet('Moon', 'Aries', 1), planet('Mercury', 'Taurus', 2, true)],
      ascendant: { sign: 'Virgo', signSymbol: '', degree: 4, minutes: 0 },
    },
    breakdown: null as unknown,
    premiumBreakdown: null as unknown,
    breakdownGenerating: false,
    premiumBreakdownGenerating: false,
  };
  return { useHoroscope: () => value, __value: value };
});
jest.mock('@/src/context/revenuecat-context', () => ({ useRevenueCat: jest.fn() }));
jest.mock('@/src/hooks/use-screen-perf-log', () => {
  const value = { markReady: jest.fn() };
  return { useScreenPerfLog: () => value };
});

// The SVG drawing itself isn't under test — the wheel tab's label is.
jest.mock('@/src/components/natalChart/natal-chart-wheel.draw', () => () => null);
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
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const horoscope = jest.requireMock('@/src/context/horoscope-context').__value;

const setAccess = (access: { hasFullAccess: boolean; loading: boolean }) =>
  (useRevenueCat as jest.Mock).mockReturnValue(access);

const tab = (name: string | RegExp) => screen.getByRole('tab', { name });

describe('BirthChartScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    horoscope.breakdown = BREAKDOWN;
    horoscope.premiumBreakdown = BREAKDOWN;
    setAccess({ hasFullAccess: false, loading: false });
  });

  describe('tabs', () => {
    // Selection was only an underline or a tint.
    it('expose role and selected state on both bars', () => {
      render(<BirthChartScreen />);

      expect(tab('Natal Wheel').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
      expect(tab('Insights').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

      fireEvent.press(tab('Natal Table'));
      expect(tab('Natal Table').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
      expect(tab('Natal Wheel').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    });

    // The lock is an icon, so a free user tapped Planets not knowing it was locked.
    it('say which tabs are premium for a free user', () => {
      render(<BirthChartScreen />);

      expect(tab('Planets, premium')).toBeTruthy();
      expect(tab('Aspects, premium')).toBeTruthy();
      expect(tab('Houses')).toBeTruthy();
    });

    it('carry no premium marker for a subscriber', () => {
      setAccess({ hasFullAccess: true, loading: false });
      render(<BirthChartScreen />);

      expect(tab('Planets')).toBeTruthy();
      expect(screen.queryByRole('tab', { name: /premium/ })).toBeNull();
    });
  });

  // PremiumUnlock only draws its button when given onUnlock, and it wasn't —
  // so the locked tabs were a dead end for every free user.
  it('lets a free user unlock the Planets tab', () => {
    render(<BirthChartScreen />);
    fireEvent.press(tab('Planets, premium'));

    expect(screen.getByRole('header', { name: 'Unlock Planets' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Unlock Now' }));
    expect(router.push).toHaveBeenCalledWith('/(settings)/paywall');
  });

  /**
   * Free and premium breakdowns are one Firestore doc, so treating everyone as
   * premium while RevenueCat loaded showed a free user the full Planets tab.
   */
  it('shows loading, not premium content, while RevenueCat resolves', () => {
    setAccess({ hasFullAccess: false, loading: true });
    render(<BirthChartScreen />);
    fireEvent.press(tab('Planets'));

    expect(screen.queryByText('PREMIUM_VENUS_READING')).toBeNull();
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
    // …and no lock is drawn yet, so a subscriber sees none flash past.
    expect(screen.queryByRole('tab', { name: /premium/ })).toBeNull();
  });

  describe('houses', () => {
    it('reads each house as a heading, and says when one is locked', () => {
      render(<BirthChartScreen />);
      fireEvent.press(tab('Houses'));

      expect(screen.getByRole('header', { name: 'House 1, Aries 12°' })).toBeTruthy();
      expect(screen.getByRole('header', { name: 'House 5, Leo 3°. Premium' })).toBeTruthy();
      // The locked reading is not rendered at all.
      expect(screen.queryByText('House five reading.')).toBeNull();
    });
  });

  it('makes insight cards headings', () => {
    render(<BirthChartScreen />);

    expect(screen.getByRole('header', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Big Picture' })).toBeTruthy();
  });

  // The wheel is SVG — nothing for a screen reader without this.
  it('describes the wheel and points to the table', () => {
    render(<BirthChartScreen />);

    expect(
      screen.getByRole('image', {
        name: 'Natal chart wheel. Sun in Aries, Moon in Aries, Rising in Virgo. The Natal Table tab lists every placement.',
      }),
    ).toBeTruthy();
  });

  describe('natal table', () => {
    // Cell by cell it read "Aries, ☉, SUN, 1" with the house last.
    it('reads each placement as one sentence, including retrograde', () => {
      render(<BirthChartScreen />);
      fireEvent.press(tab('Natal Table'));

      expect(screen.getByLabelText('Sun in Aries, house 1')).toBeTruthy();
      expect(screen.getByLabelText('Ascendant in Virgo, house 1')).toBeTruthy();
      expect(screen.getByLabelText('Mercury in Taurus, house 2, retrograde')).toBeTruthy();
      // Column headers are hidden once every row reads in full.
      expect(screen.queryByText('PLANET')).toBeNull();
    });

    // The chart frame is a fixed height that hides overflow.
    it('scrolls inside the fixed chart frame', () => {
      render(<BirthChartScreen />);
      fireEvent.press(tab('Natal Table'));

      const row = screen.getByLabelText('Sun in Aries, house 1');
      let node = row.parent;
      // Host elements carry their native name as a string `type`
      while (node && (node.type as unknown) !== 'RCTScrollView') node = node.parent;
      expect(node).toBeTruthy();
      expect(within(node!).getByLabelText('Mercury in Taurus, house 2, retrograde')).toBeTruthy();
    });
  });
});
