import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView, View } from 'react-native';

import HomeScreen from '@/app/(main)/index';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { router } from 'expo-router';
import { subscribeToHoroscope } from '@/src/services/horoscope.service';
import { logEvent } from '@react-native-firebase/analytics';
import DateSwitcher from '@/src/components/home/date-switcher.component';
import HomeSignsDisplay from '@/src/components/shared/signs-display.component';

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
  const value = { chartDetails: null, horoscope: null as unknown, transitMoon: null, breakdown: null };
  return { useHoroscope: () => value, __value: value };
});
jest.mock('@/src/context/revenuecat-context', () => ({ useRevenueCat: jest.fn() }));
jest.mock('@/src/hooks/use-screen-perf-log', () => {
  const value = { markReady: jest.fn() };
  return { useScreenPerfLog: () => value };
});

// Rendering is not under test here — only what the screen subscribes to.
jest.mock('@/app/(settings)/select-avatar', () => ({ getProfileImageSource: () => 1 }));
// jest.mock, not a doMock loop: only jest.mock is hoisted above the imports.
jest.mock('@/src/components/home/date-switcher.component', () => jest.fn(() => null));
jest.mock('@/src/components/home/home-text-box.component', () => () => null);
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/signs-display.component', () => jest.fn(() => null));
jest.mock('@/src/components/shared/paygate-overlay.component', () => jest.fn(() => null));
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

const presentPaywall = jest.fn(() => Promise.resolve(false));

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

  // Opened in place rather than through the spinner route, so closing it
  // lands straight back on Home.
  it('opens the paywall in place from the paygate', async () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: false, loading: false, presentPaywall });
    render(<HomeScreen />);
    await act(async () => {});

    const PaygateOverlay = jest.requireMock('@/src/components/shared/paygate-overlay.component') as jest.Mock;
    act(() => PaygateOverlay.mock.calls.at(-1)[0].onUnlock());

    expect(presentPaywall).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  describe('analytics', () => {
    const interactions = () =>
      (logEvent as jest.Mock).mock.calls.filter(([, n]) => n === 'ui_interaction').map(([, , p]) => p);
    const lastProps = (component: unknown) => {
      const calls = (component as jest.Mock).mock.calls;
      return calls[calls.length - 1][0];
    };

    beforeEach(() => {
      (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: true, loading: false });
    });

    // The date id is never sent — only which day it is relative to today.
    it('reports the date switcher as a relative day', async () => {
      render(<HomeScreen />);
      await act(async () => {});

      await act(async () => lastProps(DateSwitcher).onChange('2026-10-22'));
      await act(async () => lastProps(DateSwitcher).onChange('2026-10-20'));

      expect(interactions()).toEqual([
        { screen: 'home', feature: 'date_switcher', action: 'select', item: 'tomorrow' },
        { screen: 'home', feature: 'date_switcher', action: 'select', item: 'yesterday' },
      ]);
    });

    describe('read depth', () => {
      const horoscope = (jest.requireMock('@/src/context/horoscope-context') as any).__value;
      const PaygateOverlay = jest.requireMock('@/src/components/shared/paygate-overlay.component') as jest.Mock;
      const layoutEvent = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } });
      const scrollEvent = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } });
      const sectionViews = () => interactions().filter((e: any) => e.feature === 'reading_section');
      const reading = { quote: 'q', advice: 'a', do: [], dont: [], planetsRetrograde: [] };

      /** The reading's section wrappers, top to bottom: quote … warning. */
      const sections = () =>
        screen.UNSAFE_getByType(ScrollView).findAll((n) => n.type === View && !!n.props.onLayout);
      /** Lay the list out: a 500pt viewport over quote (0), advice (250) and warning (3000). */
      const layOut = () => {
        const [quote, advice] = sections();
        const warning = sections().at(-1)!;
        fireEvent(screen.UNSAFE_getByType(ScrollView), 'layout', layoutEvent(0, 500));
        fireEvent(quote, 'layout', layoutEvent(0, 200));
        fireEvent(advice, 'layout', layoutEvent(250, 200));
        fireEvent(warning, 'layout', layoutEvent(3000, 200));
      };
      const view = (item: string) => ({ screen: 'home', feature: 'reading_section', action: 'view', item });

      beforeEach(() => {
        // Draw the list under the paygate, which these tests need to scroll.
        PaygateOverlay.mockImplementation(({ children }) => children);
        horoscope.horoscope = reading;
      });
      afterEach(() => {
        PaygateOverlay.mockImplementation(() => null);
        horoscope.horoscope = null;
      });

      it('measures every section of the reading', async () => {
        render(<HomeScreen />);
        await act(async () => {});

        expect(sections()).toHaveLength(13);
      });

      it('reports each section once per day, as it scrolls into view', async () => {
        render(<HomeScreen />);
        await act(async () => {});
        layOut();
        fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), scrollEvent(2900));
        fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), scrollEvent(0));
        expect(sectionViews()).toEqual([view('quote'), view('advice'), view('warning')]);

        // Tomorrow's reading lands, and the user switches to it: read from the top again.
        // (Tomorrow's id comes from the real clock, unlike the mocked today: the later of the two.)
        const [, tomorrow] = [...(subscribeToHoroscope as jest.Mock).mock.calls].sort((x, y) => x[1].localeCompare(y[1]));
        await act(async () => tomorrow[2](reading));
        await act(async () => lastProps(DateSwitcher).onChange(tomorrow[1]));

        expect(sectionViews()).toEqual([
          view('quote'), view('advice'), view('warning'),
          view('quote'), view('advice'),
        ]);
      });

      // Under the paygate a free user sees a blurred skeleton, not the reading.
      it('counts nothing on a paygated day', async () => {
        (useRevenueCat as jest.Mock).mockReturnValue({ hasFullAccess: false, loading: false });
        render(<HomeScreen />);
        await act(async () => {});
        await act(async () => lastProps(DateSwitcher).onChange('2026-10-20'));
        layOut();
        fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), scrollEvent(2900));

        expect(sectionViews()).toEqual([]);
      });
    });

    it('reports the View chart link', async () => {
      render(<HomeScreen />);
      await act(async () => {});

      await act(async () => lastProps(HomeSignsDisplay).onViewChart());

      expect(interactions()).toEqual([{ screen: 'home', feature: 'view_chart', action: 'tap' }]);
    });
  });
});
