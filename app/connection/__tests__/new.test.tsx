import '@/test-utils/connection-screen-mocks';

import React from 'react';
import { Alert, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SingleConnectionCreateScreen from '@/app/connection/new';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
// Stable values, as the real providers give — see app/(main)/__tests__/chat.test.tsx.
jest.mock('@/src/context/user-context', () => {
  const value = { authUser: { uid: 'uid-1' }, userDoc: { firstName: 'Luna', lastName: 'Moon' } };
  return { useUser: () => value };
});
jest.mock('@/src/context/horoscope-context', () => {
  const value = { chartDetails: null };
  return { useHoroscope: () => value };
});

const checked = (name: string) =>
  screen.getByRole('radio', { name }).props.accessibilityState?.checked;

describe('SingleConnectionCreateScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  /**
   * The options were image-only — their names existed only in code — and the
   * field is required to save, so a screen-reader user could not finish.
   */
  it('names the relationship options and reports the choice', () => {
    render(<SingleConnectionCreateScreen />);

    expect(screen.getByLabelText('Relationship type')).toBeTruthy();
    expect(checked("It's Complicated")).toBe(false);
    fireEvent.press(screen.getByRole('radio', { name: "It's Complicated" }));
    expect(checked("It's Complicated")).toBe(true);
    expect(checked("It's Consistent")).toBe(false);
  });

  it('marks each person section as a heading', () => {
    render(<SingleConnectionCreateScreen />);

    expect(screen.getByRole('header', { name: 'First Individual' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Second Individual' })).toBeTruthy();
  });

  // "Birthday, text field" was said twice with nothing to say whose.
  it("names each field by its person once both are shown", () => {
    render(<SingleConnectionCreateScreen />);
    fireEvent(screen.getByRole('switch', { name: 'Use my chart' }), 'valueChange', false);

    expect(screen.getByLabelText('First Individual, birthday')).toBeTruthy();
    expect(screen.getByLabelText('Second Individual, birthday')).toBeTruthy();
    expect(screen.getByLabelText('First Individual, first name')).toBeTruthy();
    expect(screen.getByLabelText('Second Individual, first name')).toBeTruthy();
    expect(screen.getByLabelText('First Individual, pronouns')).toBeTruthy();
    expect(screen.getByLabelText('Second Individual, pronouns')).toBeTruthy();
  });

  it('sends focus to the first missing field after a validation error', async () => {
    render(<SingleConnectionCreateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'View Connection' }));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Missing Information',
      expect.stringContaining('Second Person'),
      [expect.objectContaining({ text: 'OK' })],
    );
    const focus = (TextInput as any).prototype.focus as jest.Mock;
    focus.mockClear();
    act(() => {
      alertSpy.mock.calls[0][2][0].onPress();
    });
    expect(focus.mock.contexts[0].props.accessibilityLabel).toBe('Second Individual, first name');
  });
});
