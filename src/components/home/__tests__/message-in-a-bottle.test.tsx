import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import MessageInABottleComponent from '@/src/components/home/message-in-a-bottle.component';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/src/constants/strings', () => ({ MESSAGE_IN_A_BOTTLE_RESPONSES: ['The universe heard you.'] }));

describe('MessageInABottleComponent', () => {
  // Icon-only, so it had no name.
  it('names Send and reports it disabled until there is a message', () => {
    render(<MessageInABottleComponent placeholder="Message to the universe" />);

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Message to the universe'), 'Hello');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  // "Tap anywhere to close" meant nothing without sight of the screen.
  it('reads the reply as one button that closes it', () => {
    render(<MessageInABottleComponent placeholder="Message to the universe" />);
    fireEvent.changeText(screen.getByLabelText('Message to the universe'), 'Hello');
    fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

    const reply = screen.getByRole('button', { name: 'The universe heard you.' });
    expect(reply.props.accessibilityHint).toBe('Closes the message');
  });
});
