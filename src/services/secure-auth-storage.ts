import * as SecureStore from 'expo-secure-store';

// ─── Keychain protection class ────────────────────────────────────────────────
//
// expo-secure-store defaults `keychainAccessible` to WHEN_UNLOCKED
// (`kSecAttrAccessibleWhenUnlocked` — see its ios/SecureStoreOptions.swift).
// That default is what caused the intermittent iOS sign-outs: every read and
// write of a WHEN_UNLOCKED item throws `errSecInteractionNotAllowed` while the
// device is locked, and the app is launched *into the background while locked*
// on every `content-available` push (app.config.js declares the
// `remote-notification` background mode; the midnight rollover push fires when
// the phone is face-down and locked).
//
// In that background launch, Firebase's RN persistence probes storage with
// `_isAvailable()`, which swallows the throw and returns false. Firebase then
// silently falls back to in-memory persistence for the lifetime of the process
// (`PersistenceUserManager.create` — "Fall back to the first persistence
// listed, or in memory if none available"), so `currentUser` resolves to null
// and AuthGate routes the user to the welcome screen. The Keychain blob was
// never touched, which is why a later cold launch signs them straight back in.
//
// AFTER_FIRST_UNLOCK keeps the item readable any time the device has been
// unlocked at least once since boot, which covers every background wake.
// THIS_DEVICE_ONLY because a refresh token should not ride an encrypted backup
// onto a different device.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// SecureStore caps each value at ~2 KB on iOS (CFPreferences/Keychain) and is
// effectively unlimited on Android, but we chunk uniformly to stay safe.
// Firebase Auth's persisted blob (`firebase:authUser:<apiKey>:<name>`)
// routinely exceeds 2 KB once a refresh token + ID token are present.
const CHUNK_SIZE = 1800;

// Keys written before the accessibility fix carry WHEN_UNLOCKED, and iOS pins
// `kSecAttrAccessible` at insert time — expo-secure-store's `set` falls through
// to `SecItemUpdate` on `errSecDuplicateItem`, which rewrites only the value
// and leaves the protection class alone. So a rewrite in place would *not*
// upgrade them. Writing under a fresh namespace forces `SecItemAdd`, which does
// apply OPTIONS. The old namespace stays readable so nobody is signed out by
// the very update that fixes the sign-outs, and is deleted on first write.
const NAMESPACE = 'fbauth2_';
const LEGACY_NAMESPACE = 'fbauth_';

// SecureStore keys must match /^[A-Za-z0-9._-]+$/. Firebase keys contain ':',
// which is not allowed, so we encode them to a safe namespace.
function safeKey(key: string, ns: string = NAMESPACE): string {
  return ns + key.replace(/[^A-Za-z0-9._-]/g, '_');
}

function metaKey(key: string, ns?: string): string {
  return safeKey(key, ns) + '__meta';
}

/**
 * Chunk keys are generation-scoped. A write lands a complete new generation
 * before the meta pointer moves, so no interruption can expose a torn value.
 */
function chunkKey(key: string, generation: number, idx: number): string {
  return safeKey(key) + '__g' + generation + 'c' + idx;
}

function legacyChunkKey(key: string, idx: number): string {
  return safeKey(key, LEGACY_NAMESPACE) + '__c' + idx;
}

/** `null` generation means the legacy (pre-generation) layout. */
type Meta = { generation: number | null; count: number };

function parseMeta(raw: string | null): Meta | null {
  if (!raw) return null;
  const generational = /^(\d+)\.(\d+)$/.exec(raw);
  if (generational) {
    return { generation: Number(generational[1]), count: Number(generational[2]) };
  }
  // Legacy layout: a bare chunk count, chunks at `fbauth_<key>__c<idx>`.
  const count = parseInt(raw, 10);
  if (Number.isFinite(count) && count > 0) return { generation: null, count };
  return null;
}

function keysFor(key: string, meta: Meta): string[] {
  return Array.from({ length: meta.count }, (_, i) =>
    meta.generation === null ? legacyChunkKey(key, i) : chunkKey(key, meta.generation, i),
  );
}

async function readChunks(key: string, meta: Meta): Promise<string | null> {
  const parts: string[] = [];
  for (const k of keysFor(key, meta)) {
    const part = await SecureStore.getItemAsync(k, OPTIONS);
    if (part === null) return null; // torn legacy write — treat as missing
    parts.push(part);
  }
  return parts.join('');
}

/**
 * Deletes chunks that nothing points at any more. Best-effort by design: these
 * are already unreachable, so a failure here leaks a Keychain entry but can
 * never corrupt a read.
 */
async function discard(key: string, meta: Meta | null): Promise<void> {
  if (!meta) return;
  for (const k of keysFor(key, meta)) {
    try {
      await SecureStore.deleteItemAsync(k, OPTIONS);
    } catch {
      // Unreferenced already — ignore.
    }
  }
}

export const SecureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    // Errors deliberately propagate. A Keychain failure means "storage is
    // unavailable", which is not the same as "no user is signed in" — swallowing
    // it here would assert the user is signed out and reintroduce the bug.
    const meta = parseMeta(await SecureStore.getItemAsync(metaKey(key), OPTIONS));
    if (meta) {
      if (meta.count <= 0) return null;
      return readChunks(key, meta);
    }

    // Nothing in the current namespace — fall back to a value written by a
    // build from before the accessibility fix.
    const legacy = parseMeta(await SecureStore.getItemAsync(metaKey(key, LEGACY_NAMESPACE), OPTIONS));
    if (!legacy || legacy.count <= 0) return null;
    return readChunks(key, legacy);
  },

  async setItem(key: string, value: string): Promise<void> {
    const current = parseMeta(await SecureStore.getItemAsync(metaKey(key), OPTIONS));
    const nextGeneration = current?.generation === 0 ? 1 : 0;

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    // An empty value still needs one chunk, or the meta count would be 0 and
    // getItem would report the key as absent.
    if (chunks.length === 0) chunks.push('');

    // 1. Land the new generation in full. The previous generation is untouched
    //    and still the one meta points at, so a throw or a process kill
    //    anywhere in here leaves the old value readable.
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, nextGeneration, i), chunks[i], OPTIONS);
    }

    // 2. Commit. One Keychain write flips the whole value over atomically.
    await SecureStore.setItemAsync(metaKey(key), `${nextGeneration}.${chunks.length}`, OPTIONS);

    // 3. Reclaim what is now unreachable.
    await discard(key, current);

    // Only the first write after the upgrade can find anything in the legacy
    // namespace, so don't pay for the lookup on every hourly token refresh.
    if (!current) {
      const legacyMeta = metaKey(key, LEGACY_NAMESPACE);
      await discard(key, parseMeta(await SecureStore.getItemAsync(legacyMeta, OPTIONS)));
      try {
        await SecureStore.deleteItemAsync(legacyMeta, OPTIONS);
      } catch {
        // Best-effort; getItem prefers the current namespace regardless.
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    const current = parseMeta(await SecureStore.getItemAsync(metaKey(key), OPTIONS));
    const legacy = parseMeta(await SecureStore.getItemAsync(metaKey(key, LEGACY_NAMESPACE), OPTIONS));

    // Drop the pointers first. After this the key reads as absent even if chunk
    // deletion is interrupted — the reverse order could leave meta pointing at
    // deleted chunks, which reads as a torn value.
    await SecureStore.deleteItemAsync(metaKey(key), OPTIONS);
    await SecureStore.deleteItemAsync(metaKey(key, LEGACY_NAMESPACE), OPTIONS);

    await discard(key, current);
    await discard(key, legacy);
  },
};
