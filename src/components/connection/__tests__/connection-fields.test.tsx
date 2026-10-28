import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  ConnectionsBirthdayField,
  ConnectionsPlaceOfBirthField,
  ConnectionsTimeOfBirthField,
  DelalunaInputRow,
  DelalunaToggle,
  PronounsField,
  personFieldLabel,
} from '@/src/components/connection/connection-fields';
import { searchNominatim } from '@/src/utils/location';

jest.mock('@/src/utils/location', () => ({
  searchNominatim: jest.fn(),
  formatPlace: (r: { display_name: string }) => r.display_name,
  detectTimezoneOffset: jest.fn(() => Promise.resolve(0)),
}));
// Captures picker props so a test can drive onChange.
const mockPicker = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => (props: unknown) => {
  mockPicker(props);
  return null;
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// ThemedView reaches theme-context → firebaseConfig, which throws under Jest.
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});

const PERSON = 'Second Individual';

describe('personFieldLabel', () => {
  // The form asks for two people; "Birthday" alone was said twice.
  it('qualifies a field with its person', () => {
    expect(personFieldLabel(PERSON, 'Birthday')).toBe('Second Individual, birthday');
    expect(personFieldLabel(undefined, 'Birthday')).toBe('Birthday');
  });
});

describe('connection fields', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
    jest.useRealTimers();
  });

  // The label beside a Switch isn't its name.
  it('names the Use my chart switch', () => {
    render(<DelalunaToggle label="Use my chart" value={false} onToggle={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Use my chart' })).toBeTruthy();
  });

  it('names text inputs by person, and hides the duplicate caption', () => {
    render(
      <DelalunaInputRow
        person={PERSON}
        fields={[{ label: 'First Name', type: 'text' }]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Second Individual, first name')).toBeTruthy();
    expect(screen.queryByText('FIRST NAME')).toBeNull();
  });

  it('exposes pronouns as radios under a person-named group', () => {
    const onChange = jest.fn();
    render(<PronounsField person={PERSON} value="They/Them" onChange={onChange} />);

    expect(screen.getByLabelText('Second Individual, pronouns')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'They/Them' }).props.accessibilityState?.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'He/Him' }));
    expect(onChange).toHaveBeenCalledWith({ Pronouns: 'He/Him' });
  });

  describe('birthday', () => {
    it('names the field and the calendar button by person', () => {
      render(<ConnectionsBirthdayField person={PERSON} value="" onChange={jest.fn()} />);

      expect(screen.getByLabelText('Second Individual, birthday')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Choose birthday from a calendar, Second Individual' }));
      expect(screen.getByRole('button', { name: 'Type birthday instead, Second Individual' })).toBeTruthy();
    });

    // Locked was only a dimmer icon.
    it('reports the calendar as disabled once locked', () => {
      render(<ConnectionsBirthdayField person={PERSON} value="03/15/1990" onChange={jest.fn()} editable={false} />);

      expect(screen.getByRole('button', { name: /calendar/ })).toBeDisabled();
    });
  });

  describe('time of birth, once locked', () => {
    /**
     * Birthday and place honoured `editable` everywhere; time only in typed
     * text. The picker, "I don't know" and "Enter time" could still change a
     * locked time.
     */
    it('blocks every way of changing it', () => {
      const onChange = jest.fn();
      render(
        <ConnectionsTimeOfBirthField person={PERSON} value="3:45 PM" onChange={onChange} editable={false} />,
      );

      expect(screen.getByLabelText('Second Individual, time of birth').props.editable).toBe(false);
      const choose = screen.getByRole('button', { name: /Choose time of birth/ });
      expect(choose).toBeDisabled();
      // And a press really does nothing (TouchableOpacity also honours accessibilityState.disabled).
      fireEvent.press(choose);
      expect(mockPicker).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /I don't know/ })).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    // The picker can already be open when the field locks (the change count
    // arrives from Firestore after the form renders); its change must not land.
    it('ignores a change from a picker that was already open', () => {
      const onChange = jest.fn();
      const { rerender } = render(<ConnectionsTimeOfBirthField value="" onChange={onChange} editable />);
      fireEvent.press(screen.getByRole('button', { name: 'Choose time of birth' }));

      rerender(<ConnectionsTimeOfBirthField value="" onChange={onChange} editable={false} />);
      const picker = mockPicker.mock.calls.at(-1)[0];
      act(() => {
        picker.onChange({}, new Date(2000, 0, 1, 15, 45));
      });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('hides Enter time when the time is unknown and locked', () => {
      render(<ConnectionsTimeOfBirthField person={PERSON} value="" isUnknown onChange={jest.fn()} editable={false} />);

      expect(screen.getByLabelText('Second Individual, time of birth, unknown')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Enter time of birth/ })).toBeNull();
    });
  });

  describe('place of birth', () => {
    it('says which person "I don\'t know" is for', () => {
      render(<ConnectionsPlaceOfBirthField person={PERSON} value="" birthday="" onChange={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: "I don't know the place of birth, Second Individual" }),
      ).toBeTruthy();
    });

    // Results appear under the field with focus still in it.
    it('announces how many places a search found', async () => {
      jest.useFakeTimers();
      (searchNominatim as jest.Mock).mockResolvedValue([
        { place_id: 1, display_name: 'Paris, France', lat: '48.8', lon: '2.3' },
        { place_id: 2, display_name: 'Paris, Texas', lat: '33.6', lon: '-95.5' },
      ]);
      render(<ConnectionsPlaceOfBirthField person={PERSON} value="" birthday="" onChange={jest.fn()} />);

      fireEvent.changeText(screen.getByLabelText('Second Individual, place of birth'), 'Paris');
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(announce).toHaveBeenCalledWith('2 places found');
      expect(screen.getByRole('button', { name: 'Paris, Texas' })).toBeTruthy();
    });
  });
});
