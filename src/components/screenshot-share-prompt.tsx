import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { usePathname, useSegments } from 'expo-router';
import { captureScreen } from 'react-native-view-shot';

import SharePromptSheet, { SHARE_NETWORK_NAMES } from '@/src/components/share-prompt-sheet';
import { SOCIAL_HANDLES, SOCIAL_LINKS, type SocialNetwork } from '@/src/constants/links';
import { Events, screenLabelForPath } from '@/src/services/analytics.service';
import { logger } from '@/src/utils/logger';
import {
  DEFAULT_SHARE_PROMPT_STATE,
  parseSharePromptState,
  recordDismissed,
  recordOptedOut,
  recordShared,
  recordShown,
  SHARE_PROMPT_STORAGE_KEY,
  shouldShowSharePrompt,
  type SharePromptState,
} from '@/src/utils/share-prompt-policy';

type ScreenCaptureModule = typeof import('expo-screen-capture');

/**
 * expo-screen-capture is native, so a build from before it was added (or an
 * OTA bundle on one) has no module and the prompt simply never fires.
 *
 * Android below 14 is skipped on purpose: there the library can only detect a
 * screenshot by reading the photo library, and READ_MEDIA_IMAGES is blocked in
 * app.config.js. 14+ uses ScreenCaptureCallback, which needs no runtime prompt.
 * iOS needs no permission at all.
 */
export function loadScreenCapture(): ScreenCaptureModule | null {
  if (Platform.OS === 'android' && (Platform.Version as number) < 34) return null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (!require('expo').requireOptionalNativeModule('ExpoScreenCapture')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-screen-capture') as ScreenCaptureModule;
  } catch {
    return null;
  }
}

export function shareCaption(network: SocialNetwork): string {
  return `Reading my stars with @${SOCIAL_HANDLES[network]} ✨`;
}

async function readState(): Promise<SharePromptState> {
  try {
    return parseSharePromptState(await AsyncStorage.getItem(SHARE_PROMPT_STORAGE_KEY));
  } catch {
    return DEFAULT_SHARE_PROMPT_STATE;
  }
}

function writeState(state: SharePromptState): void {
  AsyncStorage.setItem(SHARE_PROMPT_STORAGE_KEY, JSON.stringify(state)).catch(
    logger.catchAsync('share_prompt_save'),
  );
}

/**
 * After the user takes a screenshot, invites them to share it and tag us.
 * Mounted once in the root layout; `enabled` is false until someone is signed
 * in and verified. Nothing is shared unless they tap a network.
 */
export function ScreenshotSharePrompt({ enabled }: { enabled: boolean }) {
  const segments = useSegments();
  const pathname = usePathname();
  const routeRef = useRef({ segments: segments as readonly string[], pathname });
  const stateRef = useRef<SharePromptState | null>(null);
  const openingRef = useRef(false);
  const [prompt, setPrompt] = useState<{ imageUri: string | null; screen: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // The listener is registered once; it reads the route as of the screenshot.
  useEffect(() => {
    routeRef.current = { segments, pathname };
  }, [segments, pathname]);

  useEffect(() => {
    if (!enabled) return;
    const capture = loadScreenCapture();
    if (!capture) return;

    const onScreenshot = async () => {
      if (openingRef.current) return;
      const state = stateRef.current ?? (await readState());
      stateRef.current = state;
      const route = routeRef.current;
      if (!shouldShowSharePrompt(state, route.segments, Date.now())) return;

      openingRef.current = true;
      // Before the sheet opens, or the sheet ends up in its own image. The OS
      // never hands us the user's screenshot, so this is our own capture.
      const imageUri = await captureScreen({ format: 'jpg', quality: 0.9, result: 'tmpfile' })
        .catch(() => null);

      const next = recordShown(state, Date.now());
      stateRef.current = next;
      writeState(next);
      const screen = screenLabelForPath(route.pathname);
      Events.sharePromptShown(screen);
      setPrompt({ imageUri, screen });
    };

    const sub = capture.addScreenshotListener(() => {
      onScreenshot().catch((e) => {
        openingRef.current = false;
        logger.error('[share-prompt] screenshot handler failed', e, 'share_prompt_open');
      });
    });
    return () => {
      sub.remove();
      // Signed out with the sheet open: don't bring it back for the next account.
      openingRef.current = false;
      setPrompt(null);
    };
  }, [enabled]);

  const close = (update: (s: SharePromptState) => SharePromptState) => {
    const next = update(stateRef.current ?? DEFAULT_SHARE_PROMPT_STATE);
    stateRef.current = next;
    writeState(next);
    openingRef.current = false;
    setPrompt(null);
  };

  const handleShare = async (network: SocialNetwork) => {
    if (!prompt || busy) return;
    setBusy(true);
    const caption = shareCaption(network);
    try {
      if (network === 'x') {
        // The one network that takes the caption in the link itself.
        await Linking.openURL(SOCIAL_LINKS.xIntent(caption));
      } else {
        // Instagram, TikTok and Facebook accept no pre-filled text from another
        // app, so the caption goes on the clipboard for the user to paste.
        await Clipboard.setStringAsync(caption);
        AccessibilityInfo.announceForAccessibility(
          `Caption copied. Paste it in ${SHARE_NETWORK_NAMES[network]}.`,
        );
        if (prompt.imageUri && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(prompt.imageUri, {
            mimeType: 'image/jpeg',
            UTI: 'public.jpeg',
            dialogTitle: `Share on ${SHARE_NETWORK_NAMES[network]}`,
          });
        } else {
          await Linking.openURL(SOCIAL_LINKS.profile[network]);
        }
      }
      Events.sharePromptAction({ network, screen: prompt.screen });
      close(recordShared);
    } catch (e) {
      logger.error('[share-prompt] share failed', e, 'share_prompt_share');
    } finally {
      setBusy(false);
    }
  };

  const handleNotNow = () => {
    if (prompt) Events.sharePromptDismissed({ reason: 'not_now', screen: prompt.screen });
    close(recordDismissed);
  };

  const handleOptOut = () => {
    if (prompt) Events.sharePromptDismissed({ reason: 'opt_out', screen: prompt.screen });
    close(recordOptedOut);
  };

  return (
    <SharePromptSheet
      visible={enabled && prompt !== null}
      imageUri={prompt?.imageUri ?? null}
      busy={busy}
      onShare={handleShare}
      onNotNow={handleNotNow}
      onOptOut={handleOptOut}
    />
  );
}
