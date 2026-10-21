import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import ChatScreen from '@/app/(main)/chat';
import { REPLY_ANNOUNCEMENTS } from '@/src/hooks/use-reply-announcements';
import {
  deleteChatSession,
  sendChatMessage,
  subscribeToChatHistory,
  subscribeToChatSessions,
  type ChatMessageDoc,
  type SavedChatSession,
} from '@/src/services/chat.service';

// ── Data layer ────────────────────────────────────────────────────────────────

jest.mock('@/firebaseConfig', () => ({ app: {}, auth: {}, db: {}, functions: {} }));

// Keep the pure helpers real (day ids, draw derivation, error classes) and stub
// only what talks to Firestore. The subscribe stubs capture their callbacks so a
// test can deliver snapshots.
jest.mock('@/src/services/chat.service', () => ({
  ...jest.requireActual('@/src/services/chat.service'),
  subscribeToChatHistory: jest.fn(() => jest.fn()),
  subscribeToChatSessions: jest.fn(() => jest.fn()),
  subscribeToChatUsage: jest.fn(() => jest.fn()),
  sendChatMessage: jest.fn(() => Promise.resolve()),
  retryChatMessage: jest.fn(() => Promise.resolve()),
  deleteChatSession: jest.fn(() => Promise.resolve()),
  resumeChatSession: jest.fn(() => Promise.resolve()),
  saveChatAndClear: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/src/services/connection-context.service', () => ({
  buildConnectionContextSummary: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@/src/services/natal-chart-breakdown.service', () => ({
  buildNatalChartSummary: jest.fn(() => ''),
}));
jest.mock('@/src/services/tarotCache.service', () => ({
  getRevealedChatDraws: jest.fn(() => Promise.resolve([])),
  markChatDrawRevealed: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/src/services/revenuecat.service', () => ({ purchasedChatCredits: () => 0 }));
jest.mock('@/src/services/analytics.service', () => ({
  Events: { chatMessageSent: jest.fn(), chatRetry: jest.fn() },
}));
jest.mock('@/src/services/crashlytics.service', () => ({ recordError: jest.fn() }));

// ── Contexts and hooks ────────────────────────────────────────────────────────

// Every value is created once, as the real providers do. A fresh `authUser` per
// render re-runs the screen's [authUser] effects on every render — the
// revealed-draws load then sets state, renders, and loops forever.
jest.mock('@/src/context/user-context', () => {
  const value = {
    authUser: { uid: 'uid-1' },
    userDoc: { timezoneOffsetMinutes: 0 },
    moderation: null,
  };
  return { useUser: () => value };
});
jest.mock('@/src/context/horoscope-context', () => {
  const value = { chartDetails: null };
  return { useHoroscope: () => value };
});
jest.mock('@/src/context/admin-context', () => {
  const value = { dailyChatLimit: 3, premiumDailyChatLimit: 10 };
  return { useAdmin: () => value };
});
jest.mock('@/src/context/revenuecat-context', () => {
  const value = {
    isAdmin: false,
    hasFullAccess: false,
    customerInfo: null,
    isDevMode: false,
    loading: false,
    presentChatPackPaywall: jest.fn(),
    refresh: jest.fn(),
  };
  return { useRevenueCat: () => value };
});
jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return {
    ThemeContext: createContext({
      theme: { isDark: true, colors: { headerBg: '#000', headerText: '#fff' } },
    }),
  };
});
jest.mock('@/src/hooks/use-screen-perf-log', () => {
  const value = { markReady: jest.fn(), logOp: jest.fn(), logError: jest.fn() };
  return { useScreenPerfLog: () => value };
});
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]) };
});

// ── Components ────────────────────────────────────────────────────────────────

// HeaderNav stays real — the history and new-chat buttons are its labels.
jest.mock('@/src/components/chat/tarot-draw.component', () => () => null);
jest.mock('@/src/components/connection-picker-sheet', () => () => null);
jest.mock('@/src/components/shared/consumable-placeholder.component', () => () => null);
jest.mock('@/src/components/shared/paygate-overlay.component', () => {
  const { View } = require('react-native');
  return function MockPaygateOverlay({ children }: { children: React.ReactNode }) {
    return <View>{children}</View>;
  };
});
// Both rely on the automatic JSX runtime; ts-jest compiles with the classic one.
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const message = (id: string, state: Partial<ChatMessageDoc> = {}): ChatMessageDoc => ({
  id,
  prompt: 'p',
  userMessage: 'Will it rain on my parade?',
  response: null,
  isPending: false,
  isError: false,
  createdAt: new Date(),
  mode: 'astrology',
  ...state,
});

/** Delivers a chat-history snapshot to the screen's listener. */
const deliverThread = async (msgs: ChatMessageDoc[]) => {
  const onSnapshot = (subscribeToChatHistory as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    onSnapshot(msgs);
  });
};

const deliverSessions = async (sessions: SavedChatSession[]) => {
  const onSnapshot = (subscribeToChatSessions as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    onSnapshot(sessions);
  });
};

const renderChat = async () => {
  render(<ChatScreen />);
  await act(async () => {}); // settle the mount-time storage reads
};

describe('ChatScreen', () => {
  let announce: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
    alertSpy.mockRestore();
  });

  // Icon-only, so the screen's main action used to be read as nothing.
  it('names the Send button and reports when it is disabled', async () => {
    await renderChat();

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    fireEvent.changeText(screen.getByLabelText('Message Delaluna'), 'Is today lucky?');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('sends the typed question', async () => {
    await renderChat();
    fireEvent.changeText(screen.getByLabelText('Message Delaluna'), 'Is today lucky?');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });

    expect(sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'uid-1', userMessage: 'Is today lucky?' }),
    );
  });

  // Bubble side and colour are the only signal of who is speaking.
  it('says who is speaking in each bubble, without the markup', async () => {
    await renderChat();
    await deliverThread([message('m1', { response: 'The stars say **yes**.' })]);

    expect(screen.getByLabelText('You: Will it rain on my parade?')).toBeTruthy();
    expect(screen.getByLabelText('Delaluna: The stars say yes.')).toBeTruthy();
  });

  it('says Delaluna is typing while an answer is on its way', async () => {
    await renderChat();
    await deliverThread([message('m1', { isPending: true })]);

    expect(screen.getByLabelText('Delaluna is typing')).toBeTruthy();
  });

  it('announces the answer when it lands', async () => {
    await renderChat();
    await deliverThread([message('m1', { isPending: true })]);
    await deliverThread([message('m1', { response: 'Yes.' })]);

    expect(announce).toHaveBeenCalledWith(REPLY_ANNOUNCEMENTS.replied);
  });

  it('gives Retry a button role', async () => {
    await renderChat();
    await deliverThread([message('m1', { isError: true })]);

    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('labels the header buttons', async () => {
    await renderChat();

    expect(screen.getByRole('button', { name: 'Chat history' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy();
  });

  describe('chat history', () => {
    const SESSION: SavedChatSession = {
      id: 's1',
      title: 'Career questions',
      savedAt: new Date('2026-10-20T12:00:00Z'),
      messages: [{ userMessage: 'Should I move?', response: 'Yes.', createdAt: new Date() }],
    } as SavedChatSession;

    const openHistory = async () => {
      await renderChat();
      await deliverSessions([SESSION]);
      fireEvent.press(screen.getByRole('button', { name: 'Chat history' }));
    };

    it('labels the close button and the heading', async () => {
      await openHistory();

      expect(screen.getByRole('header', { name: 'Chat History' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close chat history' })).toBeTruthy();
    });

    /**
     * The trash icon was nested inside the row's own touchable, which VoiceOver
     * collapses into one element — so it could not be reached. It also deleted
     * on a single tap, with no way back.
     */
    it('makes delete reachable on its own, and confirms first', async () => {
      await openHistory();

      fireEvent.press(screen.getByRole('button', { name: 'Delete Career questions' }));
      expect(deleteChatSession).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        'Delete saved chat?',
        '"Career questions" will be removed.',
        expect.any(Array),
      );

      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      await act(async () => {
        buttons.find((b) => b.text === 'Delete')!.onPress!();
      });
      expect(deleteChatSession).toHaveBeenCalledWith('uid-1', 's1');
    });

    it('labels both speakers in a saved conversation', async () => {
      await openHistory();
      fireEvent.press(screen.getByRole('button', { name: /^Career questions/ }));

      expect(screen.getByLabelText('You: Should I move?')).toBeTruthy();
      expect(screen.getByLabelText('Delaluna: Yes.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Back to chat history' })).toBeTruthy();
    });
  });
});
