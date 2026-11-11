import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';

import ConnectionViewScreen from '@/app/connection/[id]';
import { calculateNatalChart } from '@/src/services/astroEngine';
import { logEvent } from '@react-native-firebase/analytics';

jest.mock('@/firebaseConfig', () => ({ db: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'c1', firstFirst: 'luna', firstLast: 'moon', secondFirst: 'sol', secondLast: 'sun' }),
}));
// Stable values, as the real providers give — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' } };
  return { useUser: () => value };
});
jest.mock('@/src/context/revenuecat-context', () => {
  const value = { hasFullAccess: true, loading: false, presentPaywall: jest.fn() };
  return { useRevenueCat: () => value };
});
jest.mock('@/src/services/astroEngine', () => ({ calculateNatalChart: jest.fn() }));
jest.mock('@/src/services/synastry-reading.service', () => ({
  subscribeToSynastryReading: jest.fn(() => jest.fn()),
}));
jest.mock('@/src/constants/definitions', () => ({
  COMPATIBILITY_DEFINITIONS: new Proxy({}, { get: (_t, k) => (k === 'INTEREST' ? 'How drawn you are to each other.' : undefined) }),
}));
jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock'));
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/skeleton-lines', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const PEOPLE = {
  firstPerson: { firstName: 'Luna', lastName: 'Moon', birthday: '1990-03-15' },
  secondPerson: { firstName: 'Sol', lastName: 'Sun', birthday: '1991-07-01' },
};
const REPORT = { advice: 'Talk more.', scores: { interest: 78, ego: 40 } };

const deliver = async (data: object) => {
  const onNext = (onSnapshot as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    onNext({ exists: () => true, data: () => data });
  });
};

describe('ConnectionViewScreen', () => {
  let announce: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
    alertSpy.mockRestore();
  });

  // The ⓘ icon, the expand/collapse and the score were separate or unspoken.
  it('reads each score row as one control with its percentage and state', async () => {
    render(<ConnectionViewScreen />);
    await deliver({ ...PEOPLE, compatibility: REPORT });

    const interest = screen.getByRole('button', { name: 'Interest, 78 percent' });
    expect(interest.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(interest);
    expect(screen.getByRole('button', { name: 'Interest, 78 percent' }).props.accessibilityState?.expanded).toBe(true);
    // No definition, so not a button — just a readout.
    expect(screen.getByLabelText('Ego, 40 percent').props.accessibilityRole).toBe('text');
  });

  // Generation can take a while and lands by snapshot, with focus elsewhere.
  it('announces the report when it arrives while waiting', async () => {
    render(<ConnectionViewScreen />);
    await deliver({ ...PEOPLE, status: { state: 'pending' } });
    expect(screen.getByLabelText('Weekly advice, loading')).toBeTruthy();

    await deliver({ ...PEOPLE, compatibility: REPORT });
    expect(announce).toHaveBeenCalledWith('Compatibility reading ready.');
  });

  it('does not announce a report that was already there', async () => {
    render(<ConnectionViewScreen />);
    await deliver({ ...PEOPLE, compatibility: REPORT });
    await deliver({ ...PEOPLE, compatibility: REPORT });

    expect(announce).not.toHaveBeenCalledWith('Compatibility reading ready.');
  });

  it('marks the names and sections as headings', async () => {
    render(<ConnectionViewScreen />);
    await deliver({ ...PEOPLE, compatibility: REPORT });

    expect(screen.getByRole('header', { name: 'Luna Moon & Sol Sun' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Weekly Advice' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Weekly Forecast' })).toBeTruthy();
  });

  // A failure used to be swallowed, so the button seemed to do nothing.
  it('explains when the synastry charts cannot be calculated', async () => {
    (calculateNatalChart as jest.Mock).mockRejectedValue(new Error('swisseph'));
    render(<ConnectionViewScreen />);
    await deliver({ ...PEOPLE, compatibility: REPORT });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'View Synastry Analysis' }));
    });
    expect(alertSpy).toHaveBeenCalledWith("Can't open synastry", expect.any(String));
  });

  describe('analytics', () => {
    const events = (name: string) =>
      (logEvent as jest.Mock).mock.calls.filter(([, n]) => n === name).map(([, , p]) => p);

    it('counts the report as viewed once it arrives, and only once', async () => {
      render(<ConnectionViewScreen />);
      await deliver({ ...PEOPLE, status: { state: 'pending' } });
      expect(events('connection_report_viewed')).toHaveLength(0);

      await deliver({ ...PEOPLE, compatibility: REPORT });
      await deliver({ ...PEOPLE, compatibility: REPORT });
      expect(events('connection_report_viewed')).toHaveLength(1);
    });

    // The item is the app's own definition key, never a name or connection id.
    it('reports score definitions opening and closing', async () => {
      render(<ConnectionViewScreen />);
      await deliver({ ...PEOPLE, compatibility: REPORT });

      fireEvent.press(screen.getByRole('button', { name: 'Interest, 78 percent' }));
      fireEvent.press(screen.getByRole('button', { name: 'Interest, 78 percent' }));

      expect(events('ui_interaction')).toEqual([
        { screen: 'connection_report', feature: 'score_definition', action: 'expand', item: 'interest' },
        { screen: 'connection_report', feature: 'score_definition', action: 'collapse', item: 'interest' },
      ]);
    });

    it('reports the synastry and chat buttons', async () => {
      (calculateNatalChart as jest.Mock).mockRejectedValue(new Error('swisseph'));
      render(<ConnectionViewScreen />);
      await deliver({ ...PEOPLE, compatibility: REPORT });

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'View Synastry Analysis' }));
      });
      fireEvent.press(screen.getByRole('button', { name: 'Talk to Delaluna About It' }));

      expect(events('ui_interaction')).toEqual([
        { screen: 'connection_report', feature: 'synastry', action: 'tap' },
        { screen: 'connection_report', feature: 'talk_to_delaluna', action: 'tap' },
      ]);
      const sent = JSON.stringify((logEvent as jest.Mock).mock.calls);
      expect(sent).not.toMatch(/c1|Luna|Sol/);
    });
  });
});
