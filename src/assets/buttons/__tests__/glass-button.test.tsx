import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GlassButton } from '@/src/assets/buttons/glass-button';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

/**
 * Callers used to fake "disabled" with a wrapping opacity + pointerEvents,
 * which VoiceOver still read as an active button.
 */
describe('GlassButton', () => {
  it('is a button, enabled by default', () => {
    const onPress = jest.fn();
    render(<GlassButton title="Save" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports and enforces disabled', () => {
    const onPress = jest.fn();
    render(<GlassButton title="Save" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports busy', () => {
    render(<GlassButton title="Saving…" onPress={jest.fn()} busy />);

    expect(screen.getByRole('button').props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true }),
    );
  });
});
