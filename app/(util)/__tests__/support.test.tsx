import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import SupportScreen from '@/app/(util)/support';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/src/context/revenuecat-context', () => {
  const value = { restorePurchases: jest.fn(() => new Promise(() => {})) };
  return { useRevenueCat: () => value };
});
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('SupportScreen', () => {
  // Open / closed was only the chevron.
  it('reports FAQ rows as expandable', () => {
    render(<SupportScreen />);

    const row = screen.getByRole('button', { name: /How do I read my birth chart/ });
    expect(row.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(row);
    expect(screen.getByRole('button', { name: /How do I read my birth chart/ }).props.accessibilityState?.expanded).toBe(true);
  });

  // The FAQ told users to tap the wheel (it has no touch targets) and to pull
  // to refresh (Home has none).
  it('only describes things the app can do', () => {
    render(<SupportScreen />);
    fireEvent.press(screen.getByRole('button', { name: /How do I read my birth chart/ }));
    fireEvent.press(screen.getByRole('button', { name: /same as yesterday/ }));

    expect(screen.queryByText(/Tap any planet or sign on the wheel/)).toBeNull();
    expect(screen.queryByText(/pull to refresh/i)).toBeNull();
    expect(screen.getByText(/close the app fully and reopen it/)).toBeTruthy();
  });

  // It stayed tappable while restoring, so a second tap started a second restore.
  it('disables Restore Purchases while it works', () => {
    render(<SupportScreen />);

    fireEvent.press(screen.getByRole('button', { name: /Restore Purchases/ }));
    const restore = screen.getByRole('button', { name: /Restore Purchases/ });
    expect(restore).toBeDisabled();
    expect(restore.props.accessibilityState?.busy).toBe(true);
  });

  it('marks sections as headings and hides the decorative moon', () => {
    render(<SupportScreen />);

    expect(screen.getByRole('header', { name: 'CONTACT' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'FREQUENTLY ASKED' })).toBeTruthy();
    expect(screen.queryByText('☽')).toBeNull();
    expect(screen.getByRole('link', { name: 'Terms & Privacy' })).toBeTruthy();
  });
});
