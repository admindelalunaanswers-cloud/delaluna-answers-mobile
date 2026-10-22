import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import LoadingScreen from '@/app/(util)/loading-screen';
import { AccessibilityPrefsProvider } from '@/src/context/accessibility-context';

jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return { ThemeContext: createContext({ theme: { backgroundImage: 1 } }) };
});
const mockLottie = jest.fn();
jest.mock('lottie-react-native', () => (props: unknown) => {
  mockLottie(props);
  return null;
});

// The real provider, so Reduce Motion is read from the device as in the app.
const renderInApp = (ui: React.ReactElement) =>
  render(<AccessibilityPrefsProvider>{ui}</AccessibilityPrefsProvider>);

describe('LoadingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  it("reads as one element with the caller's message", async () => {
    renderInApp(<LoadingScreen message="Creating your account..." />);
    await act(async () => {});

    expect(screen.getByLabelText('Creating your account...').props.accessibilityState?.busy).toBe(true);
  });

  // The rotating sayings change every 3s; reading each would be noise.
  it('falls back to a steady "Loading" when cycling', async () => {
    renderInApp(<LoadingScreen />);
    await act(async () => {});

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  // The bar was plain Views with no role or value.
  it('exposes progress as a progress bar', async () => {
    renderInApp(<LoadingScreen progress={0.6} />);
    await act(async () => {});

    const bar = screen.getByRole('progressbar', { name: 'Loading' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 60 });
  });

  it('stills the animation when Reduce Motion is on', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    renderInApp(<LoadingScreen />);
    await act(async () => {});

    expect(mockLottie.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({ autoPlay: false, loop: false }));
  });

  it('stills the animation when Motion is set to Reduced in the app', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify({ motion: 'reduced' }));
    renderInApp(<LoadingScreen />);
    await act(async () => {});

    expect(mockLottie.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({ autoPlay: false, loop: false }));
  });
});
