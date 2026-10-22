/**
 * accessibility-prefs.ts
 * The in-app accessibility settings: what is stored, how a stored value is
 * read back, and how it combines with the device's own settings. Pure, so the
 * provider (src/context/accessibility-context.tsx) stays a thin shell around it.
 *
 * Stored on the device only (AsyncStorage), never in Firestore — the screen
 * promises "saved on this device".
 *
 * Adding a setting doesn't need a new storage key: parsePrefs() fills any field
 * missing from an older stored value with its default.
 */

export type MotionPref = 'system' | 'reduced';

export interface AccessibilityPrefs {
  /** 'system' follows the device's Reduce Motion; 'reduced' forces it on. */
  motion: MotionPref;
  /** Show the default theme without forgetting the one the user picked. */
  ignoreCustomTheme: boolean;
}

/** What the device itself reports. */
export interface SystemAccessibility {
  reduceMotion: boolean;
}

/** The settings as the rest of the app should act on them. */
export interface ResolvedAccessibility {
  reduceMotion: boolean;
  ignoreCustomTheme: boolean;
}

export const ACCESSIBILITY_PREFS_KEY = 'a11yPrefs:v1';

export const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = Object.freeze({
  motion: 'system',
  ignoreCustomTheme: false,
});

/**
 * Reads a stored value back. Anything unreadable, or any field with an
 * unexpected value, falls back to the default rather than failing — a corrupt
 * entry must never stop the app rendering.
 */
export function parsePrefs(raw: string | null | undefined): AccessibilityPrefs {
  if (!raw) return { ...DEFAULT_ACCESSIBILITY_PREFS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFS };
  }
  if (!data || typeof data !== 'object') return { ...DEFAULT_ACCESSIBILITY_PREFS };
  const d = data as Record<string, unknown>;
  return {
    motion: d.motion === 'reduced' || d.motion === 'system' ? d.motion : DEFAULT_ACCESSIBILITY_PREFS.motion,
    ignoreCustomTheme:
      typeof d.ignoreCustomTheme === 'boolean' ? d.ignoreCustomTheme : DEFAULT_ACCESSIBILITY_PREFS.ignoreCustomTheme,
  };
}

export function resolvePrefs(
  prefs: AccessibilityPrefs,
  system: SystemAccessibility,
): ResolvedAccessibility {
  return {
    reduceMotion: prefs.motion === 'reduced' || system.reduceMotion,
    ignoreCustomTheme: prefs.ignoreCustomTheme,
  };
}

export function isDefaultPrefs(prefs: AccessibilityPrefs): boolean {
  return (
    prefs.motion === DEFAULT_ACCESSIBILITY_PREFS.motion &&
    prefs.ignoreCustomTheme === DEFAULT_ACCESSIBILITY_PREFS.ignoreCustomTheme
  );
}

/** The caption under the Motion choice while it follows the device. */
export function motionSystemCaption(system: SystemAccessibility): string {
  return system.reduceMotion
    ? 'Following your device: motion reduced.'
    : 'Following your device: motion allowed.';
}
