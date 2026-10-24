import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { reauthenticateWithCredential } from 'firebase/auth';
import { router } from 'expo-router';

import ProfileScreen from '@/app/(settings)/profile';

jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: { email: 'luna@example.com' } },
}));
jest.mock('firebase/auth', () => ({
  deleteUser: jest.fn(),
  EmailAuthProvider: { credential: jest.fn(() => ({})) },
  reauthenticateWithCredential: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
// Not a device: skips the notification-permission check and button.
jest.mock('expo-device', () => ({ isDevice: false }));

// Stable values, as the real providers give — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/user-context', () => {
  const value = {
    authUser: { uid: 'uid-1', email: 'luna@example.com' },
    userDoc: {
      name: 'Luna Moon',
      firstName: 'Luna',
      lastName: 'Moon',
      email: 'luna@example.com',
      birthday: '1990-03-15',
      isBirthTimeUnknown: true,
      placeOfBirth: 'Paris, France',
    },
    loading: false,
  };
  return { useUser: () => value };
});
jest.mock('@/src/context/horoscope-context', () => {
  const value = {};
  return { useHoroscope: () => value };
});
jest.mock('@/src/context/revenuecat-context', () => {
  const value = {
    hasFullAccess: false,
    presentCustomerCenter: jest.fn(),
    restorePurchases: jest.fn(),
  };
  return { useRevenueCat: () => value };
});
jest.mock('@/src/services/notifications.service', () => ({
  registerForPushNotifications: jest.fn(),
  unregisterPushToken: jest.fn(),
}));
jest.mock('@/src/services/user.service', () => ({ signOut: jest.fn() }));
jest.mock('@/src/assets/legal/legal-texts', () => ({ privacyPolicy: '', termsAndConditions: '' }));

jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/sign-up/policy-modals', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('ProfileScreen', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
  });

  // Icon-only, and the main way to change your picture.
  it('names the avatar edit button', () => {
    render(<ProfileScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Change profile image' }));
    expect(router.push).toHaveBeenCalledWith('/(settings)/select-avatar');
  });

  // The badge is ~30pt; the hit slop is what makes it a 44pt target.
  it('gives the avatar edit button a touch target larger than the badge', () => {
    render(<ProfileScreen />);

    expect(screen.getByRole('button', { name: 'Change profile image' }).props.hitSlop).toEqual({
      top: 7, bottom: 7, left: 7, right: 7,
    });
  });

  it('marks the section labels as headings', () => {
    render(<ProfileScreen />);

    expect(screen.getByRole('header', { name: 'ACCOUNT' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'BIRTH DETAILS' })).toBeTruthy();
  });

  // Label and value used to be two separate stops.
  it('reads each detail row as one element', () => {
    render(<ProfileScreen />);

    // The nearest host View above the label is the row itself.
    let row = screen.getByText('First name').parent;
    while (row && (row.type as unknown) !== 'View') row = row.parent;
    expect(row!.props.accessible).toBe(true);
    expect(row!.findByProps({ children: 'Luna' })).toBeTruthy();
  });

  // The visible "Copied" lasts 1.5s and isn't where focus is.
  it('announces that the user ID was copied', async () => {
    render(<ProfileScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /User ID/ }));
    });
    expect(announce).toHaveBeenCalledWith('User ID copied');
  });

  it('gives every settings action a button role', () => {
    render(<ProfileScreen />);

    for (const name of [
      'Edit Profile',
      'Change Theme',
      'Reset Password',
      'Accessibility',
      'Support',
      'Feedback',
      'Log out',
      'Terms of Use',
      'Privacy Policy',
      'Delete account',
      'Upgrade to Premium',
      'Restore Purchases',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
  });

  // While working, the text was replaced by a spinner, leaving it nameless.
  it('keeps the delete confirmation button named while it works', async () => {
    let finish!: () => void;
    (reauthenticateWithCredential as jest.Mock).mockReturnValue(
      new Promise<void>((r) => {
        finish = r;
      }),
    );
    render(<ProfileScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('header', { name: 'Delete your account?' })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret');

    const confirm = screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!;
    await act(async () => {
      fireEvent.press(confirm);
    });

    const busy = screen.getByRole('button', { name: 'Deleting account' });
    expect(busy.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));

    await act(async () => {
      finish();
    });
  });
});
