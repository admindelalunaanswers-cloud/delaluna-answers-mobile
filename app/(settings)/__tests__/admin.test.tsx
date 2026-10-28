import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AdminScreen from '@/app/(settings)/admin';

jest.mock('@/firebaseConfig', () => ({ db: {}, functions: {} }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/src/services/admin-entitlements.service', () => ({
  // The real lists, so the screen renders the rows it does in the app.
  OVERRIDABLE_ENTITLEMENT_IDS: jest.requireActual('@/src/services/admin-entitlements.service')
    .OVERRIDABLE_ENTITLEMENT_IDS,
  PROMOTIONAL_DURATIONS: jest.requireActual('@/src/services/admin-entitlements.service')
    .PROMOTIONAL_DURATIONS,
  getEntitlementMirror: jest.fn(),
  grantEntitlement: jest.fn(),
  revokeEntitlement: jest.fn(),
  searchUsersByUidPrefix: jest.fn(() => Promise.resolve([])),
}));

// Stable values, as the real providers give — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/admin-context', () => {
  const value = {
    dailyChatLimit: 3,
    premiumDailyChatLimit: 10,
    freeConnectionLimit: 0,
    premiumConnectionLimit: 5,
    setDailyChatLimit: jest.fn(),
    setPremiumDailyChatLimit: jest.fn(),
    setFreeConnectionLimit: jest.fn(),
    setPremiumConnectionLimit: jest.fn(),
    resetToDefaults: jest.fn(),
  };
  return {
    DEFAULT_DAILY_CHAT_LIMIT: 3,
    DEFAULT_PREMIUM_DAILY_CHAT_LIMIT: 10,
    DEFAULT_FREE_CONNECTION_LIMIT: 0,
    DEFAULT_PREMIUM_CONNECTION_LIMIT: 5,
    useAdmin: () => value,
    __value: value,
  };
});
jest.mock('@/src/context/revenuecat-context', () => {
  const value = { devPlan: 'auto', setDevPlan: jest.fn(), isPro: false, isAdmin: true, hasFullAccess: false };
  return { useRevenueCat: () => value, __value: value };
});

jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const admin = jest.requireMock('@/src/context/admin-context').__value;
const revenueCat = jest.requireMock('@/src/context/revenuecat-context').__value;

describe('AdminScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * − and + were unnamed icon buttons with the value as a third, separate stop.
   * Now one adjustable control: swipe up / down.
   */
  it('makes each limit one adjustable control with its value', () => {
    render(<AdminScreen />);

    const stepper = screen.getByRole('adjustable', { name: 'Free daily chat questions' });
    expect(stepper.props.accessibilityValue).toEqual({ min: 0, max: 50, now: 3 });

    fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(admin.setDailyChatLimit).toHaveBeenCalledWith(4);
    fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(admin.setDailyChatLimit).toHaveBeenCalledWith(2);
  });

  it('still names the touch buttons, for TalkBack', () => {
    render(<AdminScreen />);

    expect(screen.getByLabelText('Increase Free daily chat questions')).toBeTruthy();
    expect(screen.getByLabelText('Decrease Free daily chat questions')).toBeTruthy();
  });

  // The stepper buttons are ~30pt; the hit slop is what makes them 44pt targets.
  it('gives the stepper buttons touch targets larger than the buttons', () => {
    render(<AdminScreen />);

    const slop = { top: 7, bottom: 7, left: 7, right: 7 };
    expect(screen.getByLabelText('Increase Free daily chat questions').props.hitSlop).toEqual(slop);
    expect(screen.getByLabelText('Decrease Free daily chat questions').props.hitSlop).toEqual(slop);
  });

  // The checked dot was only drawn.
  it('exposes the plan options as radios', () => {
    render(<AdminScreen />);

    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(1);
    const checked = radios.filter((r) => r.props.accessibilityState?.checked);
    expect(checked).toHaveLength(1);

    fireEvent.press(radios.find((r) => !r.props.accessibilityState?.checked)!);
    expect(revenueCat.setDevPlan).toHaveBeenCalled();
  });
});
