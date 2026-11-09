import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';

import ConnectionsScreen from '@/app/(main)/connections';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { deleteConnection } from '@/src/services/connection.service';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/firebaseConfig', () => ({ db: {}, functions: {} }));

jest.mock('@/src/context/user-context', () => ({
  useUser: () => ({ authUser: { uid: 'uid-1' } }),
}));
jest.mock('@/src/context/revenuecat-context', () => ({ useRevenueCat: jest.fn() }));
jest.mock('@/src/context/admin-context', () => ({
  useAdmin: () => ({ freeConnectionLimit: 1, premiumConnectionLimit: 5 }),
}));
jest.mock('@/src/services/connections-cache.service', () => ({
  ConnectionsCache: {
    load: jest.fn(() => Promise.resolve([])),
    save: jest.fn(),
    remove: jest.fn(),
  },
}));
// Deletion goes through the shared service (Cloud Function + cache + analytics).
jest.mock('@/src/services/connection.service', () => ({
  deleteConnection: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/src/services/crashlytics.service', () => ({ recordError: jest.fn() }));

jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock'));
// Renders the row and drops the swipe-revealed actions: what a screen reader,
// which cannot swipe, actually gets.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return function MockSwipeable({ children }: { children: React.ReactNode }) {
    return <View>{children}</View>;
  };
});

jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/delaluna-container.component', () => {
  const { View } = require('react-native');
  return View;
});
jest.mock('@/src/components/shared/paygate-overlay.component', () => {
  const { View } = require('react-native');
  return function MockPaygateOverlay({ children }: { children: React.ReactNode }) {
    return <View>{children}</View>;
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
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const CONNECTIONS = [
  {
    id: 'c1',
    firstPerson: { firstName: 'Luna', lastName: 'Moon' },
    secondPerson: { firstName: 'Sol', lastName: 'Sun' },
  },
];

// Ordered newest first, as the screen's `createTime desc` query returns them.
const SECOND_CONNECTION = {
  id: 'c2',
  firstPerson: { firstName: 'Luna', lastName: 'Moon' },
  secondPerson: { firstName: 'Stella', lastName: 'Star' },
};

const renderWith = async (premium: boolean, connections = CONNECTIONS) => {
  (useRevenueCat as jest.Mock).mockReturnValue({ isAdmin: false, hasFullAccess: premium });
  render(<ConnectionsScreen />);
  // Deliver the Firestore snapshot the screen subscribes to.
  const onNext = (onSnapshot as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    onNext({ docs: connections.map(({ id, ...data }) => ({ id, data: () => data })) });
  });
};

describe('ConnectionsScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // The heart between the names is a font glyph; nothing named the pair.
  it('names a connection by both people', async () => {
    await renderWith(true);

    expect(screen.getByRole('button', { name: 'Luna Moon and Sol Sun' })).toBeTruthy();
  });

  /**
   * Swipe-to-delete was the only way to remove a connection anywhere in the
   * app, and VoiceOver, TalkBack, Switch Control and keyboards can't swipe
   * (WCAG 2.5.1). The row now offers Delete as an accessibility action.
   */
  it('can be deleted without swiping', async () => {
    await renderWith(true);

    const row = screen.getByRole('button', { name: 'Luna Moon and Sol Sun' });
    expect(row.props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete connection' },
    ]);

    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(alertSpy).toHaveBeenCalledWith(
      'Remove Connection',
      'Are you sure you want to remove this connection?',
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Yes, Remove')!.onPress!();
    });
    expect(deleteConnection).toHaveBeenCalledWith('uid-1', 'c1');
  });

  // Free accounts get one connection. A lapsed subscriber keeps the oldest
  // one open and the rest lock, newest first.
  it('says when a connection is locked', async () => {
    await renderWith(false, [SECOND_CONNECTION, ...CONNECTIONS]);

    expect(screen.getByRole('button', { name: 'Luna Moon and Stella Star, locked' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Luna Moon and Sol Sun' })).toBeTruthy();
  });

  it("leaves a free user's one connection unlocked", async () => {
    await renderWith(false);

    expect(screen.getByRole('button', { name: 'Luna Moon and Sol Sun' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Connection' })).toBeNull();
    expect(screen.getByText('1 of 1 connections')).toBeTruthy();
  });

  it('offers a free user with no connections a slot', async () => {
    await renderWith(false, []);

    fireEvent.press(screen.getByRole('button', { name: 'Add Connection' }));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(require('expo-router').router.push).toHaveBeenCalledWith('/connection/new');
  });

  it('gives the empty capacity slots a button role', async () => {
    await renderWith(true);

    expect(screen.getAllByRole('button', { name: 'Add Connection' }).length).toBeGreaterThan(0);
  });
});
