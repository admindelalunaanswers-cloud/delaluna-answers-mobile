import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';

import PurchasedReportsScreen from '@/app/(settings)/purchased-reports';

jest.mock('@/firebaseConfig', () => ({ db: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' } };
  return { useUser: () => value };
});
jest.mock('@/src/services/astroEngine', () => ({ calculateNatalChart: jest.fn() }));
jest.mock('@/src/stores/navigation-store', () => ({ NavigationStore: { setSynastryAnalysis: jest.fn() } }));
jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock'));
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const deliver = async (docs: object[]) => {
  const onNext = (onSnapshot as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    onNext({ docs: docs.map((d: any) => ({ id: d.id, data: () => d })) });
  });
};

describe('PurchasedReportsScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('labels the loading spinner', () => {
    render(<PurchasedReportsScreen />);
    expect(screen.getByLabelText('Loading reports')).toBeTruthy();
  });

  // The heart between the names is a font glyph.
  it('names a report by both people and the relationship', async () => {
    render(<PurchasedReportsScreen />);
    await deliver([{
      id: 'c1', synastryUnlocked: true, relationshipType: 'Romantic',
      firstPerson: { firstName: 'Luna', lastName: 'Moon', birthday: '1990-03-15' },
      secondPerson: { firstName: 'Sol', lastName: 'Sun', birthday: '1991-07-01' },
    }]);

    expect(screen.getByRole('button', { name: 'Luna Moon and Sol Sun, Romantic' })).toBeTruthy();
  });

  // Returned silently before — the tap did nothing.
  it('explains when a report cannot be opened', async () => {
    render(<PurchasedReportsScreen />);
    await deliver([{
      id: 'c1', synastryUnlocked: true,
      firstPerson: { firstName: 'Luna' },
      secondPerson: { firstName: 'Sol', birthday: '1991-07-01' },
    }]);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /Luna and Sol/ }));
    });
    expect(alertSpy).toHaveBeenCalledWith("Can't open report", expect.stringContaining('missing a birthday'));
  });
});
