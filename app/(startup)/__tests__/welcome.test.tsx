import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import Welcome from '@/app/(startup)/welcome';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('lottie-react-native', () => () => null);
jest.mock('@/src/context/accessibility-context', () => ({
  ...jest.requireActual('@/src/context/accessibility-context'),
  useReducedMotion: () => true,
}));
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

describe('Welcome', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exposes Get Started as a button', () => {
    render(<Welcome />);
    expect(screen.getByRole('button', { name: 'GET STARTED' })).toBeTruthy();
  });

  // It used to sit inside a <Text>, which made it an inline attachment that
  // VoiceOver could not reach.
  it('exposes Log In as a button outside any text', () => {
    render(<Welcome />);
    const logIn = screen.getByRole('button', { name: /Already a member\?\s+Log In/ });

    let parent = logIn.parent;
    while (parent) {
      expect(parent.type).not.toBe('Text');
      parent = parent.parent;
    }

    fireEvent.press(logIn);
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});
