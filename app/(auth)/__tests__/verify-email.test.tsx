import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import VerifyEmail from '@/app/(auth)/verify-email';

const mockSendCode = jest.fn();
const mockVerifyCode = jest.fn();

// The screen binds both callables at module scope, so they must exist before import.
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: (_fns: unknown, name: string) =>
    name === 'sendVerificationCode'
      ? (...args: unknown[]) => mockSendCode(...args)
      : (...args: unknown[]) => mockVerifyCode(...args),
}));

jest.mock('@/firebaseConfig', () => ({
  app: {},
  auth: { currentUser: { getIdToken: jest.fn(() => Promise.resolve('token')) } },
}));

jest.mock('@/src/context/user-context', () => ({
  useUser: () => ({
    authUser: { email: 'luna@example.com' },
    reloadAuthUser: jest.fn(() => Promise.resolve()),
    refresh: jest.fn(() => Promise.resolve()),
  }),
}));

// Still generating, so a successful verify stays on the loading screen
// instead of navigating away mid-test.
jest.mock('@/src/context/horoscope-context', () => ({
  useHoroscope: () => ({ horoscope: null, loading: true, horoscopeGenerating: true }),
}));

jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return { ThemeContext: createContext({ theme: { backgroundImage: 1 } }) };
});

jest.mock('@/src/hooks/use-screen-perf-log', () => ({
  useScreenPerfLog: () => ({ markReady: jest.fn() }),
}));
jest.mock('@/src/services/analytics.service', () => ({ Events: { emailVerified: jest.fn() } }));
jest.mock('@/src/services/user.service', () => ({ signOut: jest.fn() }));
jest.mock('@/app/(util)/loading-screen', () => () => null);

// Both rely on the automatic JSX runtime; ts-jest compiles with the classic one.
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
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

// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const pasteCode = (code: string) =>
  fireEvent.changeText(
    screen.getByLabelText('Verification code, character 1 of 6'),
    code,
  );

describe('VerifyEmail', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendCode.mockResolvedValue({});
    mockVerifyCode.mockResolvedValue({});
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
  });

  const renderSent = async () => {
    render(<VerifyEmail />);
    // Let the auto-send on mount settle.
    await act(async () => {});
  };

  // "Code sent to" and the address used to be two separate screen-reader stops.
  it('reads the code-sent line as one element', async () => {
    await renderSent();

    expect(screen.getByLabelText('Code sent to luna@example.com')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Verification code sent to your email.');
  });

  /**
   * Auto-submit leaves focus on a code box, so the Verify button changing to
   * "Verifying…" was never read — a screen-reader user heard nothing until the
   * result arrived.
   */
  it('announces that it is verifying when a pasted code auto-submits', async () => {
    const pending = deferred();
    mockVerifyCode.mockReturnValue(pending.promise);
    await renderSent();

    await act(async () => {
      pasteCode('ABC123');
    });

    expect(mockVerifyCode).toHaveBeenCalledWith({ code: 'ABC123' });
    expect(announce).toHaveBeenCalledWith('Verifying code');

    await act(async () => {
      pending.resolve({});
    });

    expect(announce).toHaveBeenLastCalledWith('Email verified. Preparing your reading.');
  });

  it('announces a rejected code', async () => {
    mockVerifyCode.mockRejectedValue(new Error('That code is incorrect.'));
    await renderSent();

    await act(async () => {
      pasteCode('ABC123');
    });

    expect(announce).toHaveBeenCalledWith('That code is incorrect.');
    expect(screen.getByText('That code is incorrect.')).toBeTruthy();
  });
});
