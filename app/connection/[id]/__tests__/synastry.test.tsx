import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

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
});
