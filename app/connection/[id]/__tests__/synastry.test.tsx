import React from 'react';
import { AccessibilityInfo, ScrollView } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { logEvent } from '@react-native-firebase/analytics';

import SynastryAnalysisScreen, { aspectLabel } from '@/app/connection/[id]/synastry';
import { fetchSynastryReading, subscribeToSynastryReading } from '@/src/services/synastry-reading.service';
import type { Aspect } from '@/src/services/astroEngine';

jest.mock('@/firebaseConfig', () => ({ db: {} }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: 'c1' }) }));
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' } };
  return { useUser: () => value };
});

const ASPECT: Aspect = {
  planet1: 'Sun', symbol1: '☉', planet2: 'Venus', symbol2: '♀',
  type: 'trine', aspectSymbol: '△', angle: 120, orb: 2.0833, nature: 'harmonious',
};
jest.mock('@/src/services/astroEngine', () => ({ calculateSynastry: jest.fn(() => []) }));
jest.mock('@/src/utils/synastry', () => ({ selectTopAspects: () => [mockAspect] }));
const mockAspect = {
  planet1: 'Sun', symbol1: '☉', planet2: 'Venus', symbol2: '♀',
  type: 'trine', aspectSymbol: '△', angle: 120, orb: 2.0833, nature: 'harmonious',
};
jest.mock('@/src/stores/navigation-store', () => {
  const payload = { chartA: { planets: [] }, chartB: { planets: [] }, nameA: 'Luna', nameB: 'Sol' };
  return { NavigationStore: { getSynastryAnalysis: () => payload } };
});
jest.mock('@/src/services/synastry-reading.service', () => ({
  fetchSynastryReading: jest.fn(),
  requestSynastryReading: jest.fn(() => Promise.resolve()),
  subscribeToSynastryReading: jest.fn(() => jest.fn()),
}));
jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock'));
jest.mock('@/src/components/synastry/synastry-wheel.draw', () => () => null);
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/skeleton-lines', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('aspectLabel', () => {
  // Tone and ownership were colour alone (WCAG 1.4.1).
  it('says whose planets, the aspect, its tone and its orb', () => {
    expect(aspectLabel(ASPECT, 'Luna', 'Sol')).toBe(
      "Luna's Sun trine Sol's Venus, harmonious, orb 2 degrees 4 minutes",
    );
  });
});

describe('SynastryAnalysisScreen', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
  });

  it('describes the wheel and reads aspects as sentences', async () => {
    (fetchSynastryReading as jest.Mock).mockResolvedValue({ result: { loveLanguage: 'Words.' } });
    render(<SynastryAnalysisScreen />);
    await act(async () => {});

    expect(
      screen.getByRole('image', {
        name: 'Synastry chart wheel comparing Luna, in purple, and Sol, in gold. The key aspect is listed below.',
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/^Luna's Sun trine Sol's Venus, harmonious/)).toBeTruthy();
    expect(screen.getByRole('header', { name: 'KEY ASPECT' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'LOVE LANGUAGE' })).toBeTruthy();
  });

  it('announces a reading that arrives while waiting, not one already there', async () => {
    (fetchSynastryReading as jest.Mock).mockResolvedValue({ result: null, pending: true });
    render(<SynastryAnalysisScreen />);
    await act(async () => {});
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);

    const onReading = (subscribeToSynastryReading as jest.Mock).mock.calls.at(-1)[2];
    await act(async () => {
      onReading({ loveLanguage: 'Words.' });
    });
    expect(announce).toHaveBeenCalledWith('Synastry reading ready.');
  });

  it('stays quiet for a reading that was already saved', async () => {
    (fetchSynastryReading as jest.Mock).mockResolvedValue({ result: { loveLanguage: 'Words.' } });
    render(<SynastryAnalysisScreen />);
    await act(async () => {});

    expect(announce).not.toHaveBeenCalledWith('Synastry reading ready.');
  });

  describe('analytics', () => {
    const events = (name: string) =>
      (logEvent as jest.Mock).mock.calls.filter(([, n]) => n === name).map(([, , p]) => p);

    /** The section's own View — the nearest ancestor of its heading with an onLayout. */
    const sectionOf = (heading: string) => {
      let node: any = screen.getByRole('header', { name: heading });
      while (node && !node.props.onLayout) node = node.parent;
      return node;
    };
    const layoutEvent = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } });

    it('reports reading sections as they scroll into view, once each', async () => {
      (fetchSynastryReading as jest.Mock).mockResolvedValue({
        result: { loveLanguage: 'Words.', conflictStyle: 'Calm.', longevity: 'Long.' },
      });
      render(<SynastryAnalysisScreen />);
      await act(async () => {});

      const scroller = screen.UNSAFE_getByType(ScrollView);
      act(() => {
        fireEvent(scroller, 'layout', layoutEvent(0, 700));
        fireEvent(sectionOf('KEY ASPECT'), 'layout', layoutEvent(400, 200));
        fireEvent(sectionOf('LOVE LANGUAGE'), 'layout', layoutEvent(800, 200));
        fireEvent(sectionOf('CONFLICT STYLE'), 'layout', layoutEvent(1100, 200));
        fireEvent(sectionOf('LONGEVITY'), 'layout', layoutEvent(1400, 200));
      });
      act(() => {
        fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 0, y: 500 } } });
        fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
        fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { x: 0, y: 500 } } });
      });

      expect(events('ui_interaction')).toEqual([
        { screen: 'synastry', feature: 'reading_section', action: 'view', item: 'key_aspect' },
        { screen: 'synastry', feature: 'reading_section', action: 'view', item: 'love_language' },
        { screen: 'synastry', feature: 'reading_section', action: 'view', item: 'conflict_style' },
      ]);
    });

    it('does not count sections that are still loading', async () => {
      (fetchSynastryReading as jest.Mock).mockResolvedValue({ result: null, pending: true });
      render(<SynastryAnalysisScreen />);
      await act(async () => {});

      act(() => {
        fireEvent(screen.UNSAFE_getByType(ScrollView), 'layout', layoutEvent(0, 2000));
        fireEvent(sectionOf('LOVE LANGUAGE'), 'layout', layoutEvent(800, 200));
      });

      expect(events('ui_interaction')).toEqual([]);
    });
  });
});
