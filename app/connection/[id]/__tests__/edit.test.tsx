import '@/test-utils/connection-screen-mocks';

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { deleteDoc, getDoc } from 'firebase/firestore';
import { router } from 'expo-router';

import EditConnectionScreen from '@/app/connection/[id]/edit';
import { deleteConnection } from '@/src/services/connection.service';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'c1' }),
}));
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' } };
  return { useUser: () => value };
});
jest.mock('@/src/services/connection.service', () => ({
  deleteConnection: jest.fn(() => Promise.resolve()),
}));

const person = (firstName: string) => ({
  firstName, lastName: 'X', pronouns: 'They/Them', birthday: '03/15/1990',
  placeOfBirth: 'Paris, France', timeOfBirth: '3:45 PM', birthLat: 48.8, birthLon: 2.3, birthTimezone: 1,
});

const load = async (changeCount = 0) => {
  (getDoc as jest.Mock).mockResolvedValue({
    exists: () => true,
    data: () => ({
      firstPerson: person('Luna'),
      secondPerson: person('Sol'),
      relationshipType: "It's Consistent",
      birthDetailsChangeCount: changeCount,
    }),
  });
  render(<EditConnectionScreen />);
  await act(async () => {});
};

describe('EditConnectionScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('names the relationship options with the saved one checked', async () => {
    await load();

    expect(screen.getByRole('radio', { name: "It's Consistent" }).props.accessibilityState?.checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'I Dunno' }).props.accessibilityState?.checked).toBe(false);
  });

  /**
   * It used to deleteDoc directly, skipping the cache and analytics that the
   * Connections list's path handled. Both now call the shared deleteConnection.
   */
  it('deletes through the shared path, not a bare deleteDoc', async () => {
    await load();

    fireEvent.press(screen.getByRole('button', { name: 'Delete Connection' }));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete')!.onPress!();
    });

    expect(deleteConnection).toHaveBeenCalledWith('uid-1', 'c1');
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(main)/connections');
  });

  it('says so when the delete fails', async () => {
    (deleteConnection as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await load();

    fireEvent.press(screen.getByRole('button', { name: 'Delete Connection' }));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete')!.onPress!();
    });

    expect(alertSpy).toHaveBeenLastCalledWith('Error', 'Failed to delete connection.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  // With no birth-detail changes left, locking was only shown by dimming.
  it('reports the date and time pickers as disabled once locked', async () => {
    await load(3);

    for (const b of screen.getAllByRole('button', { name: /Choose (birthday|time of birth)/ })) {
      expect(b).toBeDisabled();
    }
  });
});
