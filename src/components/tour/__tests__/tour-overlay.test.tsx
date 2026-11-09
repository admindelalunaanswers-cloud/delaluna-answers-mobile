import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import TourOverlay from '@/src/components/tour/tour-overlay';
import { TOUR_STEPS } from '@/src/constants/tour';
import { TourProvider } from '@/src/context/tour-context';
import { TOUR_SEEN_KEY } from '@/src/utils/tour-policy';

// Same object every render — see "Mocked hooks" in CLAUDE.md.
jest.mock('@/src/context/user-context', () => {
  const value = {
    authUser: { uid: 'u1', emailVerified: true },
    userDoc: { firstName: 'Maya', createdAt: new Date() },
  };
  return { useUser: () => value };
});

let mockPathname = '/';
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  router: { navigate: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Reduced motion: no fades or pulse to wait on.
jest.mock('@/src/context/accessibility-context', () => ({
  useReducedMotion: () => true,
  useFontScale: () => 1,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, Path: View, Circle: View, Polyline: View };
});

const mockEvents = {
  tourOffered: jest.fn(),
  tourDeclined: jest.fn(),
  tourStarted: jest.fn(),
  tourStepViewed: jest.fn(),
  tourSkipped: jest.fn(),
  tourCompleted: jest.fn(),
};
jest.mock('@/src/services/analytics.service', () => ({
  get Events() {
    return mockEvents;
  },
}));

async function renderTour() {
  render(
    <TourProvider>
      <TourOverlay />
    </TourProvider>,
  );
  // The storage read that decides the offer.
  await act(async () => {});
}

/** Give the overlay a size, then let the target search give up (nothing is registered here). */
async function showStep() {
  fireEvent(screen.getByTestId('tour-root'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
}

describe('TourOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPathname = '/';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    Object.values(mockEvents).forEach((fn) => fn.mockClear());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers the tour to a new account on Home, by name', async () => {
    await renderTour();
    expect(screen.getByRole('header', { name: 'Welcome to Delaluna, Maya' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show me around' })).toBeTruthy();
    expect(mockEvents.tourOffered).toHaveBeenCalled();
  });

  // A push that deep-links to Chat lands there first; the offer waits for Home.
  it('keeps the offer off every screen but Home', async () => {
    mockPathname = '/chat';
    await renderTour();
    expect(screen.queryByText('Show me around')).toBeNull();
  });

  it('stays away once it has been seen on this device', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('constellation_v1');
    await renderTour();
    expect(screen.queryByText('Show me around')).toBeNull();
  });

  it('records a decline so it is not offered again', async () => {
    await renderTour();
    fireEvent.press(screen.getByRole('button', { name: "I'll explore on my own" }));
    await act(async () => {});
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(TOUR_SEEN_KEY, 'constellation_v1');
    expect(screen.queryByText('Show me around')).toBeNull();
  });

  it('walks the steps, names each one with its position, and goes back', async () => {
    await renderTour();
    fireEvent.press(screen.getByRole('button', { name: 'Show me around' }));
    await showStep();

    const total = TOUR_STEPS.length;
    expect(screen.getByRole('header', { name: `Step 1 of ${total}. ${TOUR_STEPS[0].title}` })).toBeTruthy();
    // No Back on the first step.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await showStep();
    expect(screen.getByRole('header', { name: `Step 2 of ${total}. ${TOUR_STEPS[1].title}` })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await showStep();
    expect(screen.getByRole('header', { name: `Step 1 of ${total}. ${TOUR_STEPS[0].title}` })).toBeTruthy();
  });

  // A target that never mounts (a screen that failed to load) must not strand
  // the user behind a dimmed screen with no card.
  it('shows the card without a spotlight when the target is missing', async () => {
    await renderTour();
    fireEvent.press(screen.getByRole('button', { name: 'Show me around' }));
    await showStep();
    expect(screen.getByRole('button', { name: 'Skip tour' })).toBeTruthy();
    expect(mockEvents.tourStepViewed).toHaveBeenCalledWith({ step_id: 'big_three', step_index: 0, spotlit: false });
  });

  it('skips from any step and records it', async () => {
    await renderTour();
    fireEvent.press(screen.getByRole('button', { name: 'Show me around' }));
    await showStep();
    fireEvent.press(screen.getByRole('button', { name: 'Skip tour' }));
    await act(async () => {});

    expect(mockEvents.tourSkipped).toHaveBeenCalledWith({ step_id: 'big_three', step_index: 0 });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(TOUR_SEEN_KEY, 'constellation_v1');
    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull();
  });

  it('ends on the finish card, which closes the tour', async () => {
    await renderTour();
    fireEvent.press(screen.getByRole('button', { name: 'Show me around' }));
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      await showStep();
      const label = i === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
      fireEvent.press(screen.getByRole('button', { name: label }));
    }
    await act(async () => {});

    expect(screen.getByRole('header', { name: "You're all set, Maya" })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Take me Home' }));
    await act(async () => {});
    expect(mockEvents.tourCompleted).toHaveBeenCalledWith({ cta: 'home' });
    expect(screen.queryByText("You're all set, Maya")).toBeNull();
  });
});
