import { AccessibilityInfo } from 'react-native';
import { renderHook } from '@testing-library/react-native';

import { REPLY_ANNOUNCEMENTS, useReplyAnnouncements } from '@/src/hooks/use-reply-announcements';
import type { ChatMessageDoc } from '@/src/services/chat.service';

const message = (id: string, state: Partial<ChatMessageDoc> = {}): ChatMessageDoc => ({
  id,
  prompt: '',
  userMessage: `question ${id}`,
  response: null,
  isPending: false,
  isError: false,
  createdAt: new Date('2026-10-21T12:00:00Z'),
  ...state,
});

const pending = (id: string) => message(id, { isPending: true });
const answered = (id: string) => message(id, { response: 'The stars say yes.' });
const failed = (id: string) => message(id, { isError: true });

type Props = {
  messages: ChatMessageDoc[];
  draws?: Map<string, unknown>;
  revealed?: string[];
};

const NO_DRAWS = new Map<string, unknown>();
const NONE_REVEALED: string[] = [];

describe('useReplyAnnouncements', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
  });

  const renderThread = (initial: Props) =>
    renderHook(
      ({ messages, draws = NO_DRAWS, revealed = NONE_REVEALED }: Props) =>
        useReplyAnnouncements(messages, draws, revealed),
      { initialProps: initial },
    );

  it('announces an answer arriving for a question it saw pending', () => {
    const { rerender } = renderThread({ messages: [pending('a')] });
    expect(announce).not.toHaveBeenCalled();

    rerender({ messages: [answered('a')] });

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(REPLY_ANNOUNCEMENTS.replied);
  });

  // Opening a thread must not read out every answer already in it.
  it('stays silent for answers that were already there', () => {
    const { rerender } = renderThread({ messages: [answered('a'), answered('b')] });
    rerender({ messages: [answered('a'), answered('b')] });

    expect(announce).not.toHaveBeenCalled();
  });

  it('announces once, not on every later snapshot', () => {
    const { rerender } = renderThread({ messages: [pending('a')] });
    rerender({ messages: [answered('a')] });
    rerender({ messages: [answered('a'), pending('b')] });

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('says retry is available when the generation fails', () => {
    const { rerender } = renderThread({ messages: [pending('a')] });
    rerender({ messages: [failed('a')] });

    expect(announce).toHaveBeenCalledWith(REPLY_ANNOUNCEMENTS.failed);
  });

  // The answer is held behind the draw, so "replied" would point at nothing visible.
  it('prompts for the draw when a tarot answer lands before the cards are drawn', () => {
    const draws = new Map([['a', []]]);
    const { rerender } = renderThread({ messages: [pending('a')], draws });
    rerender({ messages: [answered('a')], draws });

    expect(announce).toHaveBeenCalledWith(REPLY_ANNOUNCEMENTS.heldForDraw);
  });

  it('says replied for a tarot answer whose cards are already drawn', () => {
    const draws = new Map([['a', []]]);
    const revealed = ['a'];
    const { rerender } = renderThread({ messages: [pending('a')], draws, revealed });
    rerender({ messages: [answered('a')], draws, revealed });

    expect(announce).toHaveBeenCalledWith(REPLY_ANNOUNCEMENTS.replied);
  });
});
