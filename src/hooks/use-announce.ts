import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Speaks `message` through VoiceOver / TalkBack whenever it changes to a
 * non-empty value. For inline errors that appear without moving focus — a
 * sighted user sees the red text, a screen-reader user otherwise hears nothing.
 *
 * Used instead of `accessibilityLiveRegion`, which is Android-only. Don't
 * combine the two on one element or TalkBack reads the message twice.
 */
export function useAnnounce(message: string | null | undefined): void {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
