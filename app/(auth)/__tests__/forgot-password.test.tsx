import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';

import ForgotPasswordScreen from '@/app/(auth)/forgot-password';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

// The real module initialises the Firebase SDK; the screen only passes `auth`
// through to sendPasswordResetEmail.
jest.mock('@/firebaseConfig', () => ({ auth: { __mock: 'auth' } }));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const sendReset = sendPasswordResetEmail as jest.Mock;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const typeEmail = (value: string) =>
  fireEvent.changeText(screen.getByLabelText('Email'), value);

const pressSend = () => fireEvent.press(screen.getByRole('button', { name: /send reset link/i }));

describe('ForgotPasswordScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    sendReset.mockResolvedValue(undefined);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  /**
   * The email used to live in a `var` declared in the render body, so any
   * re-render (split-screen, a resize, a safe-area change) reset it to '' while
   * the uncontrolled input kept showing the text. Send then rejected a field
   * that visibly held an address.
   */
  it('keeps the typed email across a re-render', async () => {
    render(<ForgotPasswordScreen />);
    typeEmail('luna@example.com');

    screen.rerender(<ForgotPasswordScreen />);
    await act(async () => {
      pressSend();
    });

    expect(sendReset).toHaveBeenCalledWith({ __mock: 'auth' }, 'luna@example.com');
  });

  it('sends the trimmed address, the one that was validated', async () => {
    render(<ForgotPasswordScreen />);
    typeEmail('  luna@example.com \n');

    await act(async () => {
      pressSend();
    });

    expect(sendReset).toHaveBeenCalledWith(expect.anything(), 'luna@example.com');
  });

  it('rejects an invalid address without calling Firebase', async () => {
    render(<ForgotPasswordScreen />);
    typeEmail('not-an-email');

    await act(async () => {
      pressSend();
    });

    expect(sendReset).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Invalid Email',
      'Please enter a valid email address.',
      [expect.objectContaining({ text: 'OK', onPress: expect.any(Function) })],
    );
  });

  it('sends once when Send is pressed again while a request is in flight', async () => {
    const pending = deferred();
    sendReset.mockReturnValue(pending.promise);

    render(<ForgotPasswordScreen />);
    typeEmail('luna@example.com');
    // Hold the element: its label becomes "Sending…" after the first press.
    const button = screen.getByRole('button', { name: /send reset link/i });

    await act(async () => {
      fireEvent.press(button);
    });
    await act(async () => {
      fireEvent.press(button);
    });
    await act(async () => {
      pending.resolve();
    });

    expect(sendReset).toHaveBeenCalledTimes(1);
  });

  it('exposes the busy state to assistive tech while sending', async () => {
    const pending = deferred();
    sendReset.mockReturnValue(pending.promise);

    render(<ForgotPasswordScreen />);
    typeEmail('luna@example.com');
    await act(async () => {
      pressSend();
    });

    const button = screen.getByRole('button', { name: /sending/i });
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => {
      pending.resolve();
    });
  });

  it('confirms and returns to sign in on success', async () => {
    render(<ForgotPasswordScreen />);
    typeEmail('luna@example.com');

    await act(async () => {
      pressSend();
    });

    expect(alertSpy).toHaveBeenCalledWith('Password Reset', expect.stringContaining('reset link has been sent'));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  // Failures used to be caught and dropped, so Send appeared to do nothing.
  it.each([
    ['auth/network-request-failed', 'Network error. Please check your connection and try again.'],
    ['auth/too-many-requests', 'Too many attempts. Please wait a moment and try again.'],
    ['auth/invalid-email', 'Please enter a valid email address.'],
    ['auth/something-unexpected', 'Could not send the reset link. Please try again.'],
  ])('tells the user when the request fails with %s', async (code, message) => {
    sendReset.mockRejectedValue(Object.assign(new Error('raw firebase message'), { code }));

    render(<ForgotPasswordScreen />);
    typeEmail('luna@example.com');
    await act(async () => {
      pressSend();
    });

    expect(alertSpy).toHaveBeenCalledWith('Reset Failed', message, expect.any(Array));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('labels its controls for screen readers', () => {
    render(<ForgotPasswordScreen />);

    expect(screen.getByRole('header', { name: 'Forgot Password' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByLabelText('Email').props.textContentType).toBe('emailAddress');
  });
});
