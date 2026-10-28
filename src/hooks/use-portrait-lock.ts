import { useEffect } from 'react';
import { Dimensions, Platform, type ScaledSize } from 'react-native';

import { logger } from '@/src/utils/logger';

/**
 * expo-screen-orientation resolves its native module at import time, so a client
 * built before it was added throws on `require`. Orientation is cosmetic — degrade
 * to a no-op rather than taking the app down, and let the next native build pick
 * it up.
 */
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
try {
  ScreenOrientation = require('expo-screen-orientation');
} catch {
  logger.warn(
    '[usePortraitLock] expo-screen-orientation is unavailable — rebuild the native app to enable the portrait lock.',
  );
}

/**
 * Android's own large-screen breakpoint: at or above this smallest-width, a
 * display is treated as a tablet / unfolded foldable.
 */
const LARGE_SCREEN_DP = 600;

/**
 * Holds phones in portrait without an `android:screenOrientation` manifest
 * restriction.
 *
 * The manifest attribute is what Google Play flags as a large-screen usability
 * issue, and Android 16 ignores it on displays >= 600dp anyway. Locking here
 * instead keeps phones behaving exactly as before while letting tablets and
 * unfolded foldables use their full window.
 *
 * Re-evaluated on every dimension change so a foldable picks up the right
 * behaviour as it folds and unfolds. iOS is left alone — its portrait lock
 * comes from Info.plist.
 */
export function usePortraitLock() {
  useEffect(() => {
    if (Platform.OS !== 'android' || !ScreenOrientation) return;

    const orientation = ScreenOrientation;

    const apply = (screen: ScaledSize) => {
      const isLargeScreen = Math.min(screen.width, screen.height) >= LARGE_SCREEN_DP;

      const result = isLargeScreen
        ? orientation.unlockAsync()
        : orientation.lockAsync(orientation.OrientationLock.PORTRAIT_UP);

      // Android 16 ignores the lock on large screens; that rejection is expected.
      result.catch(() => {});
    };

    apply(Dimensions.get('screen'));
    const subscription = Dimensions.addEventListener('change', ({ screen }) => apply(screen));

    return () => subscription.remove();
  }, []);
}
