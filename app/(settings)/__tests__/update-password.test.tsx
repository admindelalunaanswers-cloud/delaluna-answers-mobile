import React from 'react';
import { Alert, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { reauthenticateWithCredential } from 'firebase/auth';

import UpdatePasswordScreen from '@/app/(settings)/update-password';

jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { email: 'luna@example.com' } }),
  EmailAuthProvider: { credential: jest.fn(() => ({})) },
  reauthenticateWithCredential: jest.fn(),
  updatePassword: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('@/src/services/user.service', () => ({ revokeMyRefreshTokens: jest.fn() }));
jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return { ThemeContext: createContext({ theme: { colors: { background: '#000' } } }) };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

const fill = (current: string, next: string, confirm = next) => {
  fireEvent.changeText(screen.getByLabelText('Current Password'), current);
  fireEvent.changeText(screen.getByLabelText('New Password'), next);
  fireEvent.changeText(screen.getByLabelText('Confirm New Password'), confirm);
};

const save = () => screen.getByRole('button', { name: /Save Password|Saving/ });

describe('UpdatePasswordScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  /**
   * Save was "disabled" by a wrapping opacity + pointerEvents="none", which
   * VoiceOver still read as an active button that did nothing.
   */
  it('reports Save as disabled until the form is valid', () => {
    render(<UpdatePasswordScreen />);
    expect(save()).toBeDisabled();

    fill('OldPass1', 'NewPass1');
    expect(save()).toBeEnabled();
  });

  // Met / not met was only an icon and a colour (WCAG 1.4.1).
  it('says which password rules are met', () => {
    render(<UpdatePasswordScreen />);
    fireEvent.changeText(screen.getByLabelText('New Password'), 'abcdefgh');

    expect(screen.getByLabelText('At least 8 characters, met')).toBeTruthy();
    expect(screen.getByLabelText('One lowercase letter (a–z), met')).toBeTruthy();
    expect(screen.getByLabelText('One uppercase letter (A–Z), not met')).toBeTruthy();
    expect(screen.getByLabelText('One number (0–9), not met')).toBeTruthy();
  });

  it('returns focus to Current Password when it is wrong', async () => {
    (reauthenticateWithCredential as jest.Mock).mockRejectedValue(
      Object.assign(new Error('x'), { code: 'auth/wrong-password' }),
    );
    render(<UpdatePasswordScreen />);
    fill('WrongPass1', 'NewPass1');

    await act(async () => {
      fireEvent.press(save());
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Error',
      'Current password is incorrect.',
      [expect.objectContaining({ text: 'OK' })],
    );
    const focus = (TextInput as any).prototype.focus as jest.Mock;
    focus.mockClear();
    act(() => {
      alertSpy.mock.calls[0][2][0].onPress();
    });
    expect(focus.mock.contexts[0].props.accessibilityLabel).toBe('Current Password');
  });

  it('gives Cancel a role and the title a heading', () => {
    render(<UpdatePasswordScreen />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Change Password' })).toBeTruthy();
  });
});
