/**
 * prompt-overrides.service.ts
 * Stores admin-edited prompt template overrides in AsyncStorage.
 * Overrides are loaded into memory on first access and sync-readable thereafter.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@delaluna/prompt_override_';

/** All currently loaded overrides (in-memory cache). */
const _cache: Record<string, string> = {};
let _loaded = false;

/** Load all saved overrides from AsyncStorage into the in-memory cache. */
export async function loadPromptOverrides(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const promptKeys = keys.filter(k => k.startsWith(PREFIX));
    if (promptKeys.length > 0) {
      const pairs = await AsyncStorage.multiGet(promptKeys);
      for (const [key, value] of pairs) {
        if (value !== null) _cache[key.slice(PREFIX.length)] = value;
      }
    }
    _loaded = true;
  } catch {
    _loaded = true; // fail silently
  }
}

/** Returns the override for the given key, or null if none is saved. */
export function getPromptOverride(key: string): string | null {
  return _cache[key] ?? null;
}

/** Returns true if any override exists for the given key. */
export function hasPromptOverride(key: string): boolean {
  return key in _cache;
}

/** Save (or update) an override and persist to AsyncStorage. */
export async function savePromptOverride(key: string, value: string): Promise<void> {
  _cache[key] = value;
  try {
    await AsyncStorage.setItem(PREFIX + key, value);
  } catch { /* fail silently */ }
}

/** Clear an override and remove from AsyncStorage. */
export async function clearPromptOverride(key: string): Promise<void> {
  delete _cache[key];
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch { /* fail silently */ }
}

/** Returns all keys that currently have overrides. */
export function getOverriddenKeys(): string[] {
  return Object.keys(_cache);
}
