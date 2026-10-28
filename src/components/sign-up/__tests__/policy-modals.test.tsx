import React from 'react';
import { ImageBackground, Modal } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PolicyModal from '@/src/components/sign-up/policy-modals';

const THEME_IMAGE = { uri: 'theme-background' };

// HeaderNav and the modal both read the theme; the real context imports
// firebaseConfig, which throws under Jest.
jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return {
    ThemeContext: createContext({
      theme: {
        isDark: true,
        backgroundImage: { uri: 'theme-background' },
        colors: { headerBg: '#000', headerText: '#fff' },
      },
    }),
  };
});
jest.mock('@/src/components/themed-text', () => {
  const { Text } = jest.requireActual('react-native');
  return { ThemedText: Text };
});
jest.mock('@/src/components/themed-view', () => {
  const { View } = jest.requireActual('react-native');
  return { ThemedView: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const POLICY = `# Privacy Policy

We respect your privacy. See the [Terms of Service](#terms-of-service).

## Data we collect

Birth details.`;

const renderModal = (onClose = jest.fn(), onLinkPress = jest.fn()) =>
  render(
    <PolicyModal
      visible
      onClose={onClose}
      title="Privacy Policy"
      textContent={POLICY}
      onLinkPress={onLinkPress}
    />,
  );

describe('PolicyModal', () => {
  // Without onRequestClose the Android back button did nothing here.
  it('closes on the Android back button', () => {
    const onClose = jest.fn();
    renderModal(onClose);

    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A Modal is its own window, so the app's background never reached it and
  // the policy showed on plain white.
  it('draws the theme background behind the policy', () => {
    renderModal();

    expect(screen.UNSAFE_getByType(ImageBackground).props.source).toEqual(THEME_IMAGE);
  });

  it('names Close by what it closes', () => {
    const onClose = jest.fn();
    renderModal(onClose);

    fireEvent.press(screen.getByRole('button', { name: 'Close Privacy Policy' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Rendered as plain views and text, so the rotor couldn't jump sections or find links.
  it('exposes markdown headings and links to assistive tech', () => {
    const onLinkPress = jest.fn();
    renderModal(jest.fn(), onLinkPress);

    expect(screen.getAllByRole('header', { name: 'Privacy Policy' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('header', { name: 'Data we collect' })).toBeTruthy();

    fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(onLinkPress).toHaveBeenCalledWith('#terms-of-service');
  });
});
