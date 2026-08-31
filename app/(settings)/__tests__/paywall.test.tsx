import React from 'react';
import { act, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import PaywallScreen from '@/app/(settings)/paywall';
import { useRevenueCat } from '@/src/context/revenuecat-context';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));

// The real context pulls in the RevenueCat native modules; only presentPaywall
// matters to this screen.
jest.mock('@/src/context/revenuecat-context', () => ({
  useRevenueCat: jest.fn(),
}));

/**
 * This screen exists to present the native paywall and get out of the way.
 *
 * `presentPaywall` is not a stable reference: closing or completing a purchase
 * runs `refresh()`, which sets a new `customerInfo`, which rebuilds
 * `resolveOffering` and with it `presentPaywall`. When the effect depended on
 * it, that re-ran on dismissal — presenting a second paywall over a screen
 * that was already being popped (a crash on close, and the paywall coming
 * straight back after a purchase) and calling `back()` twice.
 */
describe('PaywallScreen', () => {
  let presentPaywall: jest.Mock;

  const deferred = () => {
    let resolve!: (value: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (router.canGoBack as jest.Mock).mockReturnValue(true);
    presentPaywall = jest.fn().mockResolvedValue(false);
    // A fresh closure every render, exactly as the context produces one.
    (useRevenueCat as jest.Mock).mockImplementation(() => ({
      presentPaywall: (...args: unknown[]) => presentPaywall(...args),
    }));
  });

  it('presents the paywall once and returns to the previous screen', async () => {
    render(<PaywallScreen />);
    await act(async () => {});

    expect(presentPaywall).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('does not present again when the context hands back a new function identity', async () => {
    const { rerender } = render(<PaywallScreen />);
    await act(async () => {});

    // What `refresh()` causes after a purchase or a dismissal.
    rerender(<PaywallScreen />);
    await act(async () => {});

    expect(presentPaywall).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('pops once after a completed purchase rather than re-presenting', async () => {
    presentPaywall.mockResolvedValue(true);

    const { rerender } = render(<PaywallScreen />);
    await act(async () => {});
    rerender(<PaywallScreen />);
    await act(async () => {});

    expect(presentPaywall).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('replaces instead of popping when there is no history to go back to', async () => {
    // Reachable from a notification deep link, where `back()` would throw.
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    render(<PaywallScreen />);
    await act(async () => {});

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(main)');
  });

  it('does not navigate once the screen has been left', async () => {
    const pending = deferred();
    presentPaywall.mockReturnValue(pending.promise);

    const { unmount } = render(<PaywallScreen />);
    unmount();
    await act(async () => {
      pending.resolve(false);
    });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
