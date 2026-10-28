import React from 'react';
import { Alert, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';

import Login from '@/app/(auth)/login';

// The real module initialises the Firebase SDK.
jest.mock('@/firebaseConfig', () => ({ auth: { __mock: 'auth' }, db: {} }));

jest.mock('@/src/context/user-context', () => ({
  useUser: () => ({ authUser: null, loading: false }),
}));

jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return { ThemeContext: createContext({ setThemeKey: jest.fn() }) };
});

jest.mock('@/src/services/analytics.service', () => ({ Events: { login: jest.fn() } }));
jest.mock('@/src/services/user.service', () => ({ updateUserDoc: jest.fn(() => Promise.resolve()) }));
jest.mock('@/app/(util)/loading-screen', () => () => null);

// ThemedText relies on the automatic JSX runtime; ts-jest compiles with the
// classic one, so the real component throws "React is not defined".
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const signIn = signInWithEmailAndPassword as jest.Mock;

const deferred = () => {
  let reject!: (reason: unknown) => void;
  const promise = new Promise((_, r) => {
    reject = r;
  });
  return { promise, reject };
};

const fillAndSubmit = async () => {
  fireEvent.changeText(screen.getByLabelText('Email'), 'luna@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Login' }));
  });
};

describe('Login', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  /**
   * The button used to carry accessibilityLabel="Log in" over visible text
   * "Login", so Voice Control's "Tap Login" did not match its spoken name
   * (WCAG 2.5.3 Label in Name).
   */
  it('names the login button by its visible text', () => {
    render(<Login />);

    const button = screen.getByRole('button', { name: 'Login' });
    expect(button.props.accessibilityLabel).toBeUndefined();
  });

  it('announces the in-flight state through the button name and busy state', async () => {
    const pending = deferred();
    signIn.mockReturnValue(pending.promise);

    render(<Login />);
    await fillAndSubmit();

    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true }),
    );

    await act(async () => {
      pending.reject(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }));
    });
  });

  // Dismissing the failure alert used to leave focus on the Login button.
  it('returns focus to the password field after incorrect credentials', async () => {
    signIn.mockRejectedValue(Object.assign(new Error('raw'), { code: 'auth/invalid-credential' }));

    render(<Login />);
    await fillAndSubmit();

    expect(alertSpy).toHaveBeenCalledWith(
      'Login failed',
      'Incorrect email or password.',
      [expect.objectContaining({ text: 'OK', onPress: expect.any(Function) })],
    );

    // The jest TextInput mock shares one `focus` across instances; `this`
    // tells us which field it was called on.
    const focus = (TextInput as any).prototype.focus as jest.Mock;
    focus.mockClear();
    act(() => {
      alertSpy.mock.calls[0][2][0].onPress();
    });

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0].props.accessibilityLabel).toBe('Password');
  });

  it('returns focus to the email field when it is missing', async () => {
    render(<Login />);
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Login' }));
    });

    const focus = (TextInput as any).prototype.focus as jest.Mock;
    focus.mockClear();
    act(() => {
      alertSpy.mock.calls[0][2][0].onPress();
    });

    expect(signIn).not.toHaveBeenCalled();
    expect(focus.mock.contexts[0].props.accessibilityLabel).toBe('Email');
  });

  it('labels the password visibility toggle by what it will do', () => {
    render(<Login />);

    fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });
});
