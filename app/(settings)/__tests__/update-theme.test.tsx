import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setDoc } from 'firebase/firestore';
import { router } from 'expo-router';

import ChangeThemeScreen from '@/app/(settings)/update-theme.screen';

jest.mock('@/firebaseConfig', () => ({ auth: { currentUser: { uid: 'uid-1' } }, db: {} }));
// One router object, created inside the factory (jest.mock is hoisted above
// anything declared in the file): the screen calls useRouter(), the test reads `router`.
jest.mock('expo-router', () => {
  const router = { replace: jest.fn() };
  return { useRouter: () => router, router };
});

// A real provider, so selecting a theme re-renders as it does in the app.
jest.mock('@/src/context/theme-context', () => {
  const React = jest.requireActual('react');
  const colors = { headerBg: '#111', headerText: '#fff', text: '#fff', background: '#000' };
  const themes = {
    default: { key: 'default', isDark: true, colors },
    sunrise: { key: 'sunrise', isDark: true, colors },
  };
  const ThemeContext = React.createContext(null);
  function MockThemeProvider({ children }: { children: React.ReactNode }) {
    const [key, setThemeKey] = React.useState('default');
    return React.createElement(
      ThemeContext.Provider,
      { value: { theme: themes[key as keyof typeof themes], setThemeKey, themes } },
      children,
    );
  }
  return { ThemeContext, MockThemeProvider };
});
const { MockThemeProvider } = jest.requireMock('@/src/context/theme-context');

const mockHeader = jest.fn();
jest.mock('@/src/components/shared/header-nav', () => (props: unknown) => {
  mockHeader(props);
  return null;
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

const renderScreen = () =>
  render(
    <MockThemeProvider>
      <ChangeThemeScreen />
    </MockThemeProvider>,
  );

describe('ChangeThemeScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // Selection was only a border on the swatch.
  it('exposes themes as radios with the active one checked', () => {
    renderScreen();

    expect(screen.getByRole('radio', { name: 'Default' }).props.accessibilityState?.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'Sunrise' }));
    expect(screen.getByRole('radio', { name: 'Sunrise' }).props.accessibilityState?.checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Default' }).props.accessibilityState?.checked).toBe(false);
  });

  // The back arrow reverts the preview, which "Back" didn't say.
  it('labels the back arrow as Cancel', () => {
    renderScreen();
    expect(mockHeader.mock.calls.at(-1)[0].leftAccessibilityLabel).toBe('Cancel');
  });

  // It used to navigate away regardless, so the theme looked saved and reverted next launch.
  it('stays and says so when the theme fails to save', async () => {
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    renderScreen();

    await act(async () => {
      await mockHeader.mock.calls.at(-1)[0].onRightPress();
    });

    expect(alertSpy).toHaveBeenCalledWith("Couldn't save theme", expect.any(String));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
