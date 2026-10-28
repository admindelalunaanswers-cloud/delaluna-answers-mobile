import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import {
  ACCESSIBILITY_PREFS_KEY,
  DEFAULT_ACCESSIBILITY_PREFS,
  parsePrefs,
  resolvePrefs,
  type AccessibilityPrefs,
  type ResolvedAccessibility,
  type SystemAccessibility,
} from '@/src/utils/accessibility-prefs';
import { logger } from '@/src/utils/logger';

// Safe AsyncStorage wrapper — silently no-ops if native module isn't in the build yet
let AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod.default ?? mod;
} catch {
  AsyncStorage = { getItem: async () => null, setItem: async () => {} };
}

export interface AccessibilityContextType {
  /** What the user chose on the Accessibility screen. */
  prefs: AccessibilityPrefs;
  /** What the device reports, for the "Following your device" captions. */
  system: SystemAccessibility;
  /** The two combined — what the app should act on. */
  resolved: ResolvedAccessibility;
  updatePrefs: (patch: Partial<AccessibilityPrefs>) => void;
  resetPrefs: () => void;
}

const DEFAULT_SYSTEM: SystemAccessibility = { reduceMotion: false };

// The default is a working "nothing chosen" value, so a component rendered
// outside the provider (most tests) behaves as it did before this existed.
export const AccessibilityContext = createContext<AccessibilityContextType>({
  prefs: DEFAULT_ACCESSIBILITY_PREFS,
  system: DEFAULT_SYSTEM,
  resolved: resolvePrefs(DEFAULT_ACCESSIBILITY_PREFS, DEFAULT_SYSTEM),
  updatePrefs: () => {},
  resetPrefs: () => {},
});

// Wrapped in a promise chain so a storage call that throws synchronously is
// caught the same way as one that rejects.
function persist(prefs: AccessibilityPrefs) {
  Promise.resolve()
    .then(() => AsyncStorage.setItem(ACCESSIBILITY_PREFS_KEY, JSON.stringify(prefs)))
    .catch(logger.catchAsync('a11y_prefs_save'));
}

export function AccessibilityPrefsProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT_ACCESSIBILITY_PREFS);
  const [system, setSystem] = useState<SystemAccessibility>(DEFAULT_SYSTEM);

  useEffect(() => {
    let cancelled = false;

    // Both before the first render, so someone with Reduce Motion on never
    // sees a launch animation start and then stop, and a custom theme the user
    // chose to ignore never flashes up.
    // Neither failure may hold the app on a blank screen: unreadable storage
    // means defaults, an unanswered device query means motion allowed.
    Promise.all([
      Promise.resolve()
        .then(() => AsyncStorage.getItem(ACCESSIBILITY_PREFS_KEY))
        .catch(() => null),
      Promise.resolve()
        .then(() => AccessibilityInfo.isReduceMotionEnabled())
        .catch(() => false),
    ]).then(([raw, reduceMotion]) => {
      if (cancelled) return;
      setPrefs(parsePrefs(raw));
      setSystem({ reduceMotion: !!reduceMotion });
      setHydrated(true);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) => {
      setSystem((s) => ({ ...s, reduceMotion }));
    });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const updatePrefs = useCallback((patch: Partial<AccessibilityPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    const next = { ...DEFAULT_ACCESSIBILITY_PREFS };
    setPrefs(next);
    persist(next);
  }, []);

  const value = useMemo<AccessibilityContextType>(
    () => ({ prefs, system, resolved: resolvePrefs(prefs, system), updatePrefs, resetPrefs }),
    [prefs, system, updatePrefs, resetPrefs],
  );

  if (!hydrated) return null;

  return (
    <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>
  );
}

export function useAccessibilityPrefs(): AccessibilityContextType {
  return useContext(AccessibilityContext);
}

/**
 * True when decorative motion should stop: the device's Reduce Motion, or the
 * in-app "Reduced" choice. Use for RN `Animated` loops and Lottie; Reanimated
 * is already covered by <ReanimatedMotionConfig> in app/_layout.tsx.
 *
 * (That lives in the layout rather than here so this module never imports
 * Reanimated: the real package can't load under Jest, and every component
 * test that reaches this hook would otherwise need to mock it.)
 */
export function useReducedMotion(): boolean {
  return useContext(AccessibilityContext).resolved.reduceMotion;
}

/** Accessibility → Text size as a multiplier (1 = Default). See app-text.tsx. */
export function useFontScale(): number {
  return useContext(AccessibilityContext).resolved.fontScale;
}
