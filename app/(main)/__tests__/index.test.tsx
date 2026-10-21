import React from 'react';
import { act, render } from '@testing-library/react-native';

import HomeScreen from '@/app/(main)/index';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { subscribeToHoroscope } from '@/src/services/horoscope.service';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/firebaseConfig', () => ({ db: {} }));

jest.mock('@/src/services/horoscope.service', () => ({
  getTodayDateId: () => '2026-10-21',
  subscribeToHoroscope: jest.fn(() => jest.fn()),
}));
jest.mock('@/src/services/tarot-card.service', () => ({
  // Never resolves: the card draw isn't what these tests are about.
  getTarotCardDraw: jest.fn(() => new Promise(() => {})),
}));
jest.mock('@/src/services/astroEngine', () => ({
  calculateTransits: jest.fn(() => new Promise(() => {})),
}));

// Stable values, as the real providers give — see chat.test.tsx.
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' }, userDoc: null };
  return { useUser: () => value };
});
jest.mock('@/src/context/horoscope-context', () => {
  const value = { chartDetails: null, horoscope: null, transitMoon: null, breakdown: null };
  return { useHoroscope: () => value };
});
jest.mock('@/src/context/revenuecat-context', () => ({ useRevenueCat: jest.fn() }));
jest.mock('@/src/hooks/use-screen-perf-log', () => {
  const value = { markReady: jest.fn() };
  return { useScreenPerfLog: () => value };
});

// Rendering is not under test here — only what the screen subscribes to.
jest.mock('@/app/(settings)/select-avatar', () => ({ getProfileImageSource: () => 1 }));
// jest.mock, not a doMock loop: only jest.mock is hoisted above the imports.
jest.mock('@/src/components/home/date-switcher.component', () => () => null);
jest.mock('@/src/components/home/home-text-box.component', () => () => null);
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/signs-display.component', () => () => null);
jest.mock('@/src/components/shared/paygate-overlay.component', () => () => null);
jest.mock('@/src/components/shared/ad-banner-full.component', () => () => null);
jest.mock('@/src/components/shared/ad-banner-shop.component', () => () => null);
jest.mock('@/src/components/shared/ad-banner.component', () => () => null);
jest.mock('@/src/components/shared/section-title.component', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const subscribedDates = () => (subscribeToHoroscope as jest.Mock).mock.calls.map((c) => c[1]);

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Yesterday's and tomorrow's readings are premium. They used to be loaded for
   * every user and left under the paygate's blur, where a screen reader could
   * read them out.
   */
  it('does not load the locked days for a free user', async () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: false, loading: false });
    render(<HomeScreen />);
    await act(async () => {});

    expect(subscribeToHoroscope).not.toHaveBeenCalled();
  });

  it('loads yesterday and tomorrow for a premium user', async () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: true, loading: false });
    render(<HomeScreen />);
    await act(async () => {});

    expect(subscribedDates()).toHaveLength(2);
    expect(subscribedDates()).not.toContain('2026-10-21');
  });

  // Treated as premium while RevenueCat loads, so a subscriber sees no flash of
  // locked content — but a user who turns out to be free must not keep the data.
  it('drops the subscriptions once RevenueCat says the user is free', async () => {
    const unsubscribe = jest.fn();
    (subscribeToHoroscope as jest.Mock).mockReturnValue(unsubscribe);

    (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: false, loading: true });
    const { rerender } = render(<HomeScreen />);
    await act(async () => {});
    expect(subscribeToHoroscope).toHaveBeenCalledTimes(2);

    (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: false, loading: false });
    rerender(<HomeScreen />);
    await act(async () => {});

    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
