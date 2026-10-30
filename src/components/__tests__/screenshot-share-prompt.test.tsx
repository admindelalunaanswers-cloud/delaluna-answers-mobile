import React from 'react';
import { AccessibilityInfo, Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as ScreenCapture from 'expo-screen-capture';
import * as Sharing from 'expo-sharing';

import { ScreenshotSharePrompt } from '@/src/components/screenshot-share-prompt';
import { SOCIAL_LINKS } from '@/src/constants/links';
import { Events } from '@/src/services/analytics.service';
import { SHARE_PROMPT_STORAGE_KEY } from '@/src/utils/share-prompt-policy';

jest.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
jest.mock('expo-router', () => {
  const route = { segments: ['(main)', 'chat'], pathname: '/chat' };
  return {
    __route: route,
    useSegments: () => route.segments,
    usePathname: () => route.pathname,
  };
});
jest.mock('@/src/services/analytics.service', () => ({
  screenLabelForPath: (p: string) => `label:${p}`,
  Events: {
    sharePromptShown: jest.fn(),
    sharePromptAction: jest.fn(),
    sharePromptDismissed: jest.fn(),
  },
}));
jest.mock('@/src/context/accessibility-context', () => ({
  useReducedMotion: () => false,
  useFontScale: () => 1,
}));
jest.mock('@/src/services/crashlytics.service', () => ({ recordError: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const route = jest.requireMock('expo-router').__route as {
  segments: string[];
  pathname: string;
};

const takeScreenshot = async () => {
  const listener = (ScreenCapture.addScreenshotListener as jest.Mock).mock.calls.at(-1)[0];
  await act(async () => {
    listener();
  });
};

const savedState = () => {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
    ([key]) => key === SHARE_PROMPT_STORAGE_KEY,
  );
  return JSON.parse(calls.at(-1)[1]);
};

describe('ScreenshotSharePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    route.segments = ['(main)', 'chat'];
    route.pathname = '/chat';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  it('does not listen until enabled', () => {
    render(<ScreenshotSharePrompt enabled={false} />);
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled();
  });

  it('opens after a screenshot on the chat screen and records it', async () => {
    render(<ScreenshotSharePrompt enabled />);
    expect(screen.queryByRole('header', { name: 'Loving your reading? Share it' })).toBeNull();

    await takeScreenshot();

    expect(screen.getByRole('header', { name: 'Loving your reading? Share it' })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Preview of your screen' })).toBeTruthy();
    expect(Events.sharePromptShown).toHaveBeenCalledWith('label:/chat');
    expect(savedState().lastShownAt).toEqual(expect.any(Number));
  });

  it('stays closed on a blocked screen', async () => {
    route.segments = ['(settings)', 'paywall'];
    render(<ScreenshotSharePrompt enabled />);
    await takeScreenshot();
    expect(screen.queryByRole('header', { name: 'Loving your reading? Share it' })).toBeNull();
    expect(Events.sharePromptShown).not.toHaveBeenCalled();
  });

  it('stays closed inside the cooldown', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ lastShownAt: Date.now(), dismissals: 0, optedOut: false }),
    );
    render(<ScreenshotSharePrompt enabled />);
    await takeScreenshot();
    expect(screen.queryByRole('header', { name: 'Loving your reading? Share it' })).toBeNull();
  });

  it('X opens a post with the tagged caption filled in', async () => {
    render(<ScreenshotSharePrompt enabled />);
    await takeScreenshot();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Share on X' }));
    });

    expect(Linking.openURL).toHaveBeenCalledWith(
      SOCIAL_LINKS.xIntent('Reading my stars with @Delaluna_Answers ✨'),
    );
    expect(Events.sharePromptAction).toHaveBeenCalledWith({ network: 'x', screen: 'label:/chat' });
    expect(screen.queryByRole('header', { name: 'Loving your reading? Share it' })).toBeNull();
  });

  it('Instagram copies the caption, announces it, and shares the image', async () => {
    render(<ScreenshotSharePrompt enabled />);
    await takeScreenshot();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Share on Instagram' }));
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'Reading my stars with @Delaluna_Answers ✨',
    );
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Caption copied. Paste it in Instagram.',
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/screen.jpg',
      expect.objectContaining({ mimeType: 'image/jpeg' }),
    );
    expect(savedState().dismissals).toBe(0);
  });

  it('Not now counts a dismissal', async () => {
    render(<ScreenshotSharePrompt enabled />);
    await takeScreenshot();
    fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(savedState().dismissals).toBe(1);
    expect(Events.sharePromptDismissed).toHaveBeenCalledWith({
      reason: 'not_now',
      screen: 'label:/chat',
    });
    expect(screen.queryByRole('header', { name: 'Loving your reading? Share it' })).toBeNull();
  });

  it("Don't ask again opts out", async () => {
    render(<ScreenshotSharePrompt enabled />);
    await takeScreenshot();
    fireEvent.press(screen.getByRole('button', { name: "Don't ask again" }));

    expect(savedState().optedOut).toBe(true);
  });
});
