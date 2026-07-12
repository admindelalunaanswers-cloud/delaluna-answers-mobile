import * as SecureStore from 'expo-secure-store';

// SecureStore caps each value at ~2 KB on iOS (CFPreferences/Keychain) and is
// effectively unlimited on Android, but we chunk uniformly to stay safe.
// Firebase Auth's persisted blob (`firebase:authUser:<apiKey>:<name>`)
// routinely exceeds 2 KB once a refresh token + ID token are present.
const CHUNK_SIZE = 1800;

// SecureStore keys must match /^[A-Za-z0-9._-]+$/. Firebase keys contain ':',
// which is not allowed, so we hash-encode them to a safe namespace.
function safeKey(key: string): string {
  return 'fbauth_' + key.replace(/[^A-Za-z0-9._-]/g, '_');
}

function metaKey(key: string): string {
  return safeKey(key) + '__meta';
}

function chunkKey(key: string, idx: number): string {
  return safeKey(key) + '__c' + idx;
}

export const SecureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(metaKey(key));
    if (!meta) return null;
    const count = parseInt(meta, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // partial write — treat as missing
      parts[i] = part;
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clear any previous value first so we don't leave orphaned chunks if the
    // new value has fewer parts than the old one.
    await SecureAuthStorage.removeItem(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const meta = await SecureStore.getItemAsync(metaKey(key));
    if (meta) {
      const count = parseInt(meta, 10);
      if (Number.isFinite(count) && count > 0) {
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
      }
      await SecureStore.deleteItemAsync(metaKey(key));
    }
  },
};
