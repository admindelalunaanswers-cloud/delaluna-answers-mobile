import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import SelectProfileImageScreen from '@/app/(settings)/select-avatar';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/src/services/user.service', () => ({ updateUserDoc: jest.fn() }));
// Stable value, as the real provider gives — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' }, userDoc: { profileImageId: 'profile8' }, refresh: jest.fn() };
  return { useUser: () => value };
});
// Captures the header's props: Save's spoken name is passed through it.
const mockHeader = jest.fn();
jest.mock('@/src/components/shared/header-nav', () => (props: unknown) => {
  mockHeader(props);
  return null;
});
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const checked = (name: string) =>
  screen.getByRole('radio', { name }).props.accessibilityState?.checked;

describe('SelectProfileImageScreen', () => {
  // Selection was only a border and a check icon.
  it('exposes the images as radios with the saved one checked', () => {
    render(<SelectProfileImageScreen />);

    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect(checked('Moon')).toBe(true);
    expect(checked('Saturn')).toBe(false);

    fireEvent.press(screen.getByRole('radio', { name: 'Saturn' }));
    expect(checked('Saturn')).toBe(true);
    expect(checked('Moon')).toBe(false);
  });

  // Save does nothing until the selection changes; it now says so.
  it('tells a screen reader when there is nothing to save', () => {
    render(<SelectProfileImageScreen />);
    expect(mockHeader.mock.calls.at(-1)[0].rightAccessibilityLabel).toBe('Save, no changes yet');

    fireEvent.press(screen.getByRole('radio', { name: 'Saturn' }));
    expect(mockHeader.mock.calls.at(-1)[0].rightAccessibilityLabel).toBe('Save');
  });
});
