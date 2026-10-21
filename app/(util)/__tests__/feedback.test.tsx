import React from 'react';
import { AccessibilityInfo, Alert, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FeedbackScreen from '@/app/(util)/feedback';
import { submitFeedback } from '@/src/services/feedback.service';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/src/services/feedback.service', () => ({ submitFeedback: jest.fn(() => Promise.resolve()) }));
// Native module.
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  requestReview: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

const rating = () => screen.getByRole('adjustable', { name: 'Rating' });
const send = () => screen.getByRole('button', { name: 'Send feedback' });

describe('FeedbackScreen', () => {
  let alertSpy: jest.SpyInstance;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    announce.mockRestore();
  });

  /**
   * The stars were unnamed icon buttons and a rating is required to send, so a
   * screen-reader user could not give feedback at all.
   */
  it('makes the rating one adjustable control', () => {
    render(<FeedbackScreen />);
    expect(rating().props.accessibilityValue).toEqual(expect.objectContaining({ now: 0, text: 'No rating' }));

    fireEvent(rating(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    fireEvent(rating(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(rating().props.accessibilityValue).toEqual(expect.objectContaining({ now: 2, text: '2 of 5 stars' }));

    fireEvent(rating(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(rating().props.accessibilityValue?.now).toBe(1);
  });

  it('keeps the stars named for touch and TalkBack', () => {
    render(<FeedbackScreen />);
    fireEvent.press(screen.getByLabelText('4 stars'));
    expect(rating().props.accessibilityValue?.now).toBe(4);
  });

  it('says why Send is disabled until there is a rating', () => {
    render(<FeedbackScreen />);
    expect(send()).toBeDisabled();
    expect(send().props.accessibilityHint).toBe('Choose a rating first');

    fireEvent.press(screen.getByLabelText('3 stars'));
    expect(send()).toBeEnabled();
    expect(send().props.accessibilityHint).toBeUndefined();
  });

  it('exposes topics as checkboxes and names the follow-up switch', () => {
    render(<FeedbackScreen />);

    const chat = screen.getAllByRole('checkbox', { name: 'Chat' })[0];
    expect(chat.props.accessibilityState?.checked).toBe(false);
    fireEvent.press(chat);
    expect(screen.getAllByRole('checkbox', { name: 'Chat' })[0].props.accessibilityState?.checked).toBe(true);
    expect(screen.getByRole('switch', { name: 'Allow follow-up by email' })).toBeTruthy();
  });

  // It used to only log counts and drop everything (TODO: persist).
  it('sends what the user entered, then thanks them', async () => {
    render(<FeedbackScreen />);
    fireEvent.press(screen.getByLabelText('5 stars'));
    fireEvent.press(screen.getAllByRole('checkbox', { name: 'Tarot' })[0]);
    fireEvent.press(screen.getAllByRole('checkbox', { name: 'Faster chat' })[0]);
    fireEvent.changeText(screen.getByLabelText('Your thoughts'), 'Love it');
    fireEvent(screen.getByRole('switch', { name: 'Allow follow-up by email' }), 'valueChange', false);

    await act(async () => {
      fireEvent.press(send());
    });

    expect(submitFeedback).toHaveBeenCalledWith({
      rating: 5,
      loved: ['Tarot'],
      improve: ['Faster chat'],
      comment: 'Love it',
      allowFollowUp: false,
    });
    expect(screen.getByRole('header', { name: 'Share the love?' })).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Thank you. Share the love?');
  });

  // It used to reach the thank-you screen whether or not anything was saved.
  it('keeps the form and says so when sending fails', async () => {
    (submitFeedback as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'functions/unavailable' }));
    render(<FeedbackScreen />);
    fireEvent.press(screen.getByLabelText('2 stars'));
    fireEvent.changeText(screen.getByLabelText('Your thoughts'), 'Slow chat');

    await act(async () => {
      fireEvent.press(send());
    });

    expect(alertSpy).toHaveBeenCalledWith("Couldn't send feedback", expect.stringContaining('connection'));
    expect(screen.getByLabelText('Your thoughts').props.value).toBe('Slow chat');
    expect(screen.queryByRole('header', { name: 'We hear you' })).toBeNull();
    // …and can be sent again, not stuck busy.
    expect(send()).toBeEnabled();
    expect(send().props.accessibilityState?.busy).toBe(false);
  });

  it('explains the throttle', async () => {
    (submitFeedback as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'functions/resource-exhausted' }));
    render(<FeedbackScreen />);
    fireEvent.press(screen.getByLabelText('2 stars'));

    await act(async () => {
      fireEvent.press(send());
    });
    expect(alertSpy).toHaveBeenCalledWith("Couldn't send feedback", 'Please wait a minute before sending more feedback.');
  });

  it('hides the decorative glyphs', () => {
    render(<FeedbackScreen />);
    expect(screen.queryByText('☽')).toBeNull();
    expect(screen.getAllByText('☽', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  describe('Leave Review', () => {
    let openURL: jest.SpyInstance;

    const reachReviewPrompt = async () => {
      render(<FeedbackScreen />);
      fireEvent.press(screen.getByLabelText('5 stars'));
      await act(async () => {
        fireEvent.press(send());
      });
    };

    beforeEach(() => {
      openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    });

    afterEach(() => {
      openURL.mockRestore();
    });

    it('uses the in-app review sheet when the OS offers it', async () => {
      await reachReviewPrompt();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Leave review' }));
      });

      expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
      expect(openURL).not.toHaveBeenCalled();
    });

    // The fallback used placeholder IDs (idYOUR_APP_ID), so it opened nothing.
    it("falls back to the store's review page for this app", async () => {
      (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
      await reachReviewPrompt();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Leave review' }));
      });

      expect(openURL).toHaveBeenCalledWith('itms-apps://apps.apple.com/app/id6764196892?action=write-review');
    });

    it('opens the web listing if the store app cannot open', async () => {
      (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
      openURL.mockRejectedValueOnce(new Error('no store app'));
      await reachReviewPrompt();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Leave review' }));
      });

      expect(openURL).toHaveBeenLastCalledWith('https://apps.apple.com/app/id6764196892?action=write-review');
    });
  });
});
