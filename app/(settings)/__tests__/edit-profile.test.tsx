import React from 'react';
import { AccessibilityInfo, Alert, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import EditProfileScreen from '@/app/(settings)/edit-profile';
import { searchNominatim } from '@/src/utils/location';

jest.mock('@/firebaseConfig', () => ({ auth: {}, db: {} }));

// Stable values, as the real providers give — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/user-context', () => {
  const value = {
    authUser: { uid: 'uid-1', email: 'luna@example.com' },
    userDoc: {
      firstName: 'Luna',
      lastName: 'Moon',
      pronouns: 'She/Her',
      email: 'luna@example.com',
      birthday: '1990-03-15',
      birthtime: '',
      isBirthTimeUnknown: true,
      placeOfBirth: 'Paris, France',
      isPlaceOfBirthUnknown: false,
      birthLat: 48.85,
      birthLon: 2.35,
      birthTimezone: 1,
    },
    refresh: jest.fn(),
  };
  return { useUser: () => value };
});
jest.mock('@/src/context/horoscope-context', () => {
  const value = { refresh: jest.fn() };
  return { useHoroscope: () => value };
});
jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return { ThemeContext: createContext({ theme: { backgroundImage: 1 } }) };
});

jest.mock('@/src/services/user.service', () => ({ updateUserDoc: jest.fn() }));
jest.mock('@/src/services/astroEngine', () => ({
  calculateNatalChart: jest.fn(),
  calculateTransits: jest.fn(),
}));
jest.mock('@/src/services/natal-chart-breakdown.service', () => ({ requestBreakdown: jest.fn() }));
jest.mock('@/src/services/horoscope.service', () => ({
  requestHoroscope: jest.fn(),
  getTodayDateId: () => '2026-10-21',
}));
jest.mock('@/src/services/transit-reading.service', () => ({
  requestTransitReading: jest.fn(),
  getThisWeekDateId: () => '2026-10-19',
}));
jest.mock('@/src/services/connection.service', () => ({
  updateUserChartInConnections: jest.fn(),
  refreshSynastryReadingsForUser: jest.fn(),
}));
jest.mock('@/src/utils/location', () => ({
  searchNominatim: jest.fn(),
  formatPlace: (r: { display_name: string }) => r.display_name,
  detectTimezoneOffset: jest.fn(() => Promise.resolve(1)),
}));

jest.mock('@/app/(util)/loading-screen', () => () => null);
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

/** The field the jest TextInput mock's shared `focus` was last called on. */
const focusedLabel = () => {
  const focus = (TextInput as any).prototype.focus as jest.Mock;
  return focus.mock.contexts.at(-1)?.props.accessibilityLabel;
};

describe('EditProfileScreen', () => {
  let alertSpy: jest.SpyInstance;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    announce.mockRestore();
    jest.useRealTimers();
  });

  /**
   * The form sits inside a TouchableWithoutFeedback (tap to dismiss the
   * keyboard). Without accessible={false} that wrapper hands `accessible` to
   * the ScrollView, which VoiceOver then treats as one element — so no field
   * could be focused on its own.
   */
  it('does not collapse the form into one accessibility element', () => {
    render(<EditProfileScreen />);

    let node = screen.getByLabelText('First name').parent;
    while (node && (node.type as unknown) !== 'RCTScrollView') node = node.parent;
    expect(node).toBeTruthy();
    expect(node!.props.accessible).toBe(false);
  });

  it('marks section titles and the screen title as headings', () => {
    render(<EditProfileScreen />);

    expect(screen.getByRole('header', { name: 'Edit Profile' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Personal Info' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Birth Details' })).toBeTruthy();
  });

  // Selection was only a tint.
  it('exposes pronouns as a radio group with the current choice checked', () => {
    render(<EditProfileScreen />);

    expect(screen.getByRole('radio', { name: 'She/Her' }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
    fireEvent.press(screen.getByRole('radio', { name: 'They/Them' }));
    expect(screen.getByRole('radio', { name: 'They/Them' }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByRole('radio', { name: 'She/Her' }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
  });

  // Its only text was the date; "Birthday" sat outside it.
  it('names the birthday control with its field and value', () => {
    render(<EditProfileScreen />);

    const birthday = screen.getByRole('button', { name: 'Birthday, March 15, 1990' });
    expect(birthday.props.accessibilityHint).toBe('Opens a date picker');
  });

  // Two identical "Change" links, out of context in the rotor.
  it('says what each Change link changes', () => {
    render(<EditProfileScreen />);

    expect(screen.getByRole('button', { name: 'Change birth time' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "I don't know my birth place" })).toBeTruthy();
  });

  it('returns focus to the field a validation error is about', () => {
    render(<EditProfileScreen />);
    fireEvent.changeText(screen.getByLabelText('First name'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(alertSpy).toHaveBeenCalledWith(
      'Name required',
      'Please enter your first name.',
      [expect.objectContaining({ text: 'OK' })],
    );
    act(() => {
      alertSpy.mock.calls[0][2][0].onPress();
    });
    expect(focusedLabel()).toBe('First name');
  });

  // Results appear under the field with focus still in it.
  it('announces how many places a search found', async () => {
    jest.useFakeTimers();
    (searchNominatim as jest.Mock).mockResolvedValue([
      { display_name: 'Paris, France', lat: '48.85', lon: '2.35' },
      { display_name: 'Paris, Texas', lat: '33.66', lon: '-95.55' },
    ]);
    render(<EditProfileScreen />);

    fireEvent.changeText(screen.getByLabelText('Place of birth'), 'Paris');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(announce).toHaveBeenCalledWith('2 places found');
    expect(screen.getByRole('button', { name: 'Paris, Texas' })).toBeTruthy();
  });
});
