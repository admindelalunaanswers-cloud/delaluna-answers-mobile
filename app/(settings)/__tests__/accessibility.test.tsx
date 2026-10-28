import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import AccessibilityScreen from '@/app/(settings)/accessibility';
import { AccessibilityPrefsProvider } from '@/src/context/accessibility-context';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = jest.requireActual('react-native');
  return { ThemedView: View };
});

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

/** Renders inside the real provider, starting from what's "stored". */
async function renderScreen(stored?: object, deviceReduceMotion = false) {
  getItem.mockResolvedValue(stored ? JSON.stringify(stored) : null);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(deviceReduceMotion);
  render(
    <AccessibilityPrefsProvider>
      <AccessibilityScreen />
    </AccessibilityPrefsProvider>,
  );
  await act(async () => {});
}

// Saving happens a microtask after the state change, so flush before asserting on it.
async function press(el: Parameters<typeof fireEvent.press>[0]) {
  fireEvent.press(el);
  await act(async () => {});
}

const lastSaved = () => JSON.parse(setItem.mock.calls.at(-1)[1]);
const checked = (el: { props: { accessibilityState?: { checked?: boolean } } }) =>
  el.props.accessibilityState?.checked;

describe('AccessibilityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setItem.mockResolvedValue(undefined);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  it('names its sections as headers', async () => {
    await renderScreen();
    expect(screen.getByRole('header', { name: 'TEXT & READABILITY' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'DISPLAY' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'MOTION' })).toBeTruthy();
  });

  describe('Text size', () => {
    it('offers three sizes as radios, Default checked', async () => {
      await renderScreen();
      expect(checked(screen.getByRole('radio', { name: 'Default' }))).toBe(true);
      expect(checked(screen.getByRole('radio', { name: 'Large' }))).toBe(false);
      expect(checked(screen.getByRole('radio', { name: 'Extra large' }))).toBe(false);
    });

    // The "Aa" is a picture of the size; the radio's name already says it.
    it('keeps the "Aa" samples out of the reading order', async () => {
      await renderScreen();
      expect(screen.queryByText('Aa')).toBeNull();
      expect(screen.getAllByText('Aa', { includeHiddenElements: true })).toHaveLength(3);
    });

    it('applies the choice to the screen itself and saves it', async () => {
      await renderScreen();
      const sizeOf = () => StyleSheet.flatten(screen.getByText('Your daily reading', { includeHiddenElements: true }).props.style).fontSize;
      const before = sizeOf();

      await press(screen.getByRole('radio', { name: 'Extra large' }));

      expect(checked(screen.getByRole('radio', { name: 'Extra large' }))).toBe(true);
      expect(sizeOf()).toBeCloseTo(before * 1.3);
      expect(lastSaved()).toEqual({ textSize: 'xl', motion: 'system', ignoreCustomTheme: false });
    });

    // Each sample shows its own option's size, whatever is currently chosen.
    it('does not scale the samples by the current choice', async () => {
      await renderScreen({ textSize: 'xl', motion: 'system', ignoreCustomTheme: false });
      const sizes = screen
        .getAllByText('Aa', { includeHiddenElements: true })
        .map((el) => StyleSheet.flatten(el.props.style).fontSize as number);
      expect(sizes[1] / sizes[0]).toBeCloseTo(1.15);
      expect(sizes[2] / sizes[0]).toBeCloseTo(1.3);
    });
  });

  describe('Preview', () => {
    // Its buttons are pictures; real ones that did nothing would trap a
    // screen-reader user.
    it('reads as one sample, with no buttons to reach', async () => {
      await renderScreen();
      expect(screen.getByLabelText(/^Preview: Your daily reading/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Save reading' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    });
  });

  describe('Ignore custom theme', () => {
    // One element: the row carries name, state and description, and the
    // visible "Off" and the bare Switch stay out of the reading order.
    it('reads as one named switch', async () => {
      await renderScreen();
      const toggle = screen.getByRole('switch', { name: 'Ignore custom theme' });
      expect(checked(toggle)).toBe(false);
      expect(toggle.props.accessibilityHint).toMatch(/Your theme is kept/);
      expect(screen.queryByText('Off')).toBeNull();
      expect(screen.getByText('Off', { includeHiddenElements: true })).toBeTruthy();
    });

    it('toggles and saves on this device', async () => {
      await renderScreen();
      await press(screen.getByRole('switch', { name: 'Ignore custom theme' }));

      expect(checked(screen.getByRole('switch', { name: 'Ignore custom theme' }))).toBe(true);
      expect(setItem).toHaveBeenCalledWith('a11yPrefs:v1', expect.any(String));
      expect(lastSaved()).toEqual({ textSize: 'default', motion: 'system', ignoreCustomTheme: true });
    });

    it('starts from the stored value', async () => {
      await renderScreen({ motion: 'system', ignoreCustomTheme: true });
      expect(checked(screen.getByRole('switch', { name: 'Ignore custom theme' }))).toBe(true);
    });
  });

  describe('Motion preference', () => {
    it('offers System and Reduced as radios, System checked by default', async () => {
      await renderScreen();
      expect(checked(screen.getByRole('radio', { name: 'System' }))).toBe(true);
      expect(checked(screen.getByRole('radio', { name: 'Reduced' }))).toBe(false);
    });

    it('says what the device is doing while it follows the device', async () => {
      await renderScreen(undefined, true);
      expect(screen.getByText('Following your device: motion reduced.')).toBeTruthy();
    });

    it('switches to Reduced, saves it, and drops the device caption', async () => {
      await renderScreen();
      await press(screen.getByRole('radio', { name: 'Reduced' }));

      expect(checked(screen.getByRole('radio', { name: 'Reduced' }))).toBe(true);
      expect(checked(screen.getByRole('radio', { name: 'System' }))).toBe(false);
      expect(lastSaved()).toEqual({ textSize: 'default', motion: 'reduced', ignoreCustomTheme: false });
      expect(screen.queryByText(/Following your device/)).toBeNull();
    });

    it('meets the 44pt minimum target', async () => {
      await renderScreen();
      const style = [screen.getByRole('radio', { name: 'System' }).props.style].flat(Infinity);
      expect(Math.max(...style.map((s: { minHeight?: number } | false) => (s && s.minHeight) || 0))).toBeGreaterThanOrEqual(44);
    });
  });

  describe('Reset to defaults', () => {
    it('is disabled while everything is already at its default', async () => {
      await renderScreen();
      const reset = screen.getByRole('button', { name: 'Reset to defaults' });
      expect(reset.props.accessibilityState?.disabled).toBe(true);
    });

    // Several controls change at once and focus doesn't move, so it's spoken.
    it('restores the defaults, saves them and announces it', async () => {
      await renderScreen({ textSize: 'large', motion: 'reduced', ignoreCustomTheme: true });
      await press(screen.getByRole('button', { name: 'Reset to defaults' }));

      expect(checked(screen.getByRole('radio', { name: 'Default' }))).toBe(true);
      expect(checked(screen.getByRole('radio', { name: 'System' }))).toBe(true);
      expect(checked(screen.getByRole('switch', { name: 'Ignore custom theme' }))).toBe(false);
      expect(lastSaved()).toEqual({ textSize: 'default', motion: 'system', ignoreCustomTheme: false });
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
        'Accessibility settings reset to defaults.',
      );
      expect(screen.getByRole('button', { name: 'Reset to defaults' }).props.accessibilityState?.disabled).toBe(true);
    });
  });
});
