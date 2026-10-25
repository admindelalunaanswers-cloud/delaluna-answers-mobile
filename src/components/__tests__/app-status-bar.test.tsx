import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

import {
  AppStatusBar,
  __statusBarStackForTests,
  resolveStatusBarStyle,
} from '@/src/components/app-status-bar';

const mockSetStyle = jest.fn((_style: string, _animated: boolean) => Promise.resolve());
// Mutable so a test can stand in for a build without the native module.
const mockNativeModule: { __esModule: true; default: { setStyle: typeof mockSetStyle } | null } = {
  __esModule: true,
  default: { setStyle: mockSetStyle },
};
// Read lazily: jest.mock is hoisted above the imports, so the factory runs
// before the object above exists.
jest.mock('@/modules/status-bar-style', () => ({
  __esModule: true,
  get default() {
    return mockNativeModule.default;
  },
}));

const mockExpoStatusBar = jest.fn((_props: unknown) => null);
jest.mock('expo-status-bar', () => ({
  StatusBar: (props: unknown) => mockExpoStatusBar(props),
}));

/** The style the native module was last told to show. */
const shown = () => mockSetStyle.mock.calls.at(-1)?.[0];

describe('AppStatusBar', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    __statusBarStackForTests.length = 0;
    mockNativeModule.default = { setStyle: mockSetStyle };
    Platform.OS = 'ios';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  // Same meanings as expo-status-bar's style prop.
  describe('resolveStatusBarStyle', () => {
    it('keeps light and dark as given', () => {
      expect(resolveStatusBarStyle('light', 'light')).toBe('light');
      expect(resolveStatusBarStyle('dark', 'dark')).toBe('dark');
    });

    it('reads auto as the opposite of the colour scheme', () => {
      expect(resolveStatusBarStyle('auto', 'dark')).toBe('light');
      expect(resolveStatusBarStyle('auto', 'light')).toBe('dark');
      expect(resolveStatusBarStyle(undefined, 'dark')).toBe('light');
    });

    it('reads inverted as the opposite of auto', () => {
      expect(resolveStatusBarStyle('inverted', 'dark')).toBe('dark');
      expect(resolveStatusBarStyle('inverted', 'light')).toBe('light');
    });
  });

  // iOS 27 ignores expo-status-bar's style changes, so iOS goes through the
  // native module — and with the view-controller-based Info.plist key,
  // expo-status-bar would error.
  describe('on iOS', () => {
    it('sets the style through the native module, not expo-status-bar', () => {
      render(<AppStatusBar style="dark" />);

      expect(shown()).toBe('dark');
      expect(mockExpoStatusBar).not.toHaveBeenCalled();
    });

    it('lets the newest status bar win, and restores the previous one when it goes', () => {
      const screen = render(<AppStatusBar style="light" />);
      const sheet = render(<AppStatusBar style="dark" />);
      expect(shown()).toBe('dark');

      sheet.unmount();
      expect(shown()).toBe('light');

      screen.unmount();
      expect(shown()).toBe('default');
    });

    // The root layout renders the app-wide default before {children}, so a screen
    // mounted in the same commit — a cold start — still wins over it.
    it('lets a screen beat a default rendered before it in the same tree', () => {
      render(
        <>
          <AppStatusBar style="light" />
          <AppStatusBar style="dark" />
        </>,
      );

      expect(shown()).toBe('dark');
    });

    it('keeps an older instance below a newer one when its style changes', () => {
      const older = render(<AppStatusBar style="light" />);
      render(<AppStatusBar style="dark" />);
      mockSetStyle.mockClear();

      older.rerender(<AppStatusBar style="dark" />);
      expect(mockSetStyle).not.toHaveBeenCalled();
    });

    it('updates in place when the top instance changes style', () => {
      const bar = render(<AppStatusBar style="light" />);
      bar.rerender(<AppStatusBar style="dark" />);

      expect(shown()).toBe('dark');
      expect(__statusBarStackForTests).toHaveLength(1);
    });
  });

  describe('falling back to expo-status-bar', () => {
    it('on Android', () => {
      Platform.OS = 'android';
      render(<AppStatusBar style="light" />);

      expect(mockExpoStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: 'light' }));
      expect(mockSetStyle).not.toHaveBeenCalled();
    });

    // A dev client or store build from before the module, running a newer bundle.
    it('on an iOS build without the native module', () => {
      mockNativeModule.default = null;
      render(<AppStatusBar style="light" />);

      expect(mockExpoStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: 'light' }));
    });
  });
});
