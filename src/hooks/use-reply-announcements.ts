import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { ChatMessageDoc } from '@/src/services/chat.service';

export const REPLY_ANNOUNCEMENTS = {
  replied: 'Delaluna replied.',
  heldForDraw: 'Delaluna is ready. Draw your cards to see the reading.',
  failed: "Delaluna couldn't answer. Retry is available.",
} as const;

/**
 * Tells a screen-reader user when a chat answer lands.
 *
 * Replies arrive by snapshot seconds to minutes after the question, with focus
 * somewhere else entirely, so without this a VoiceOver / TalkBack user hears
 * nothing and has to swipe the thread to find out whether an answer came.
 *
 * Only a message this hook has seen pending is announced, so opening a thread
 * doesn't read out answers that were already there. The reply text itself isn't
 * spoken — replies are long and carry rich-text markup; the bubble's label
 * reads it when the user moves to it.
 *
 * `tarotDraws` / `revealedDraws` mirror chat.tsx: a tarot answer is held behind
 * a draw the user hasn't made yet, so "replied" would point at nothing visible.
 */
export function useReplyAnnouncements(
  messages: ChatMessageDoc[],
  tarotDraws: ReadonlyMap<string, unknown>,
  revealedDraws: readonly string[],
): void {
  const pendingIds = useRef(new Set<string>());

  useEffect(() => {
    for (const msg of messages) {
      if (msg.isPending) {
        pendingIds.current.add(msg.id);
      } else if (pendingIds.current.delete(msg.id)) {
        const heldForDraw = tarotDraws.has(msg.id) && !revealedDraws.includes(msg.id);
        AccessibilityInfo.announceForAccessibility(
          msg.isError
            ? REPLY_ANNOUNCEMENTS.failed
            : heldForDraw
              ? REPLY_ANNOUNCEMENTS.heldForDraw
              : REPLY_ANNOUNCEMENTS.replied,
        );
      }
    }
  }, [messages, tarotDraws, revealedDraws]);
}
