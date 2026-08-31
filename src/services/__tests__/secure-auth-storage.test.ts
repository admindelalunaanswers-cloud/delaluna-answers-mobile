/**
 * Regression tests for the intermittent iOS sign-outs.
 *
 * Two independent defects produced the "logged out, then logged back in"
 * reports, both introduced by commit 5487968 when auth tokens moved from
 * AsyncStorage into the Keychain:
 *
 *  1. Every SecureStore call used the library default protection class,
 *     WHEN_UNLOCKED. `content-available` pushes launch the app into the
 *     background while the phone is locked, where those reads throw. Firebase
 *     reads that throw as "storage unavailable", falls back to in-memory
 *     persistence for the life of the process, and reports no signed-in user.
 *
 *  2. `setItem` deleted the whole stored value before writing the replacement,
 *     so an interruption anywhere in the ~8 sequential Keychain ops left a torn
 *     value that read back as absent — a sign-out no relaunch could recover.
 *
 * The fake below models iOS Keychain semantics closely enough to reproduce
 * both: items carry the protection class they were inserted with, and access
 * is gated on lock state. `expectedFailures` at the bottom of this file records
 * which of these cases fail against the pre-fix implementation.
 */

import * as SecureStore from 'expo-secure-store';

import { SecureAuthStorage } from '@/src/services/secure-auth-storage';

// The real key Firebase persists under. Contains ':' twice, which SecureStore
// rejects, so this also exercises key encoding.
const AUTH_KEY = 'firebase:authUser:AIzaSyDummyKeyForTests:[DEFAULT]';

/** A persisted user blob comfortably over the ~2 KB per-item Keychain cap. */
const USER_BLOB = JSON.stringify({
  uid: 'test-uid-123',
  stsTokenManager: { refreshToken: 'r'.repeat(1500), accessToken: 'a'.repeat(900) },
  providerData: [{ providerId: 'password' }],
});

// ─── Keychain fake ────────────────────────────────────────────────────────────

/** Raised by expo-secure-store as KeyChainException(-25308). */
class KeyChainException extends Error {
  constructor() {
    super('User interaction is not allowed. (-25308)');
    this.name = 'KeyChainException';
  }
}

/** Thrown by the fake to stand in for iOS suspending or jetsamming the app. */
class ProcessKilled extends Error {
  constructor() {
    super('process killed mid-write');
    this.name = 'ProcessKilled';
  }
}

type Entry = { value: string; accessible: number };

class FakeKeychain {
  items = new Map<string, Entry>();
  locked = false;
  /** False only between a reboot and the first passcode entry. */
  unlockedSinceBoot = true;
  /** Mutating ops remaining before the fake simulates a process kill. */
  private budget = Infinity;

  lock() {
    this.locked = true;
  }

  unlock() {
    this.locked = false;
    this.unlockedSinceBoot = true;
  }

  reboot() {
    this.locked = true;
    this.unlockedSinceBoot = false;
  }

  /** Kill the process after `n` further successful writes/deletes. */
  killAfter(n: number) {
    this.budget = n;
  }

  private isReadable(accessible: number): boolean {
    // AFTER_FIRST_UNLOCK(_THIS_DEVICE_ONLY) — available once unlocked since boot.
    if (accessible === SecureStore.AFTER_FIRST_UNLOCK) return this.unlockedSinceBoot;
    if (accessible === SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY) return this.unlockedSinceBoot;
    // WHEN_UNLOCKED(_THIS_DEVICE_ONLY) — available only while unlocked.
    return !this.locked;
  }

  private spend() {
    if (this.budget <= 0) throw new ProcessKilled();
    this.budget -= 1;
  }

  get(key: string, options?: SecureStore.SecureStoreOptions): string | null {
    void options;
    const entry = this.items.get(key);
    // Absent keys return errSecItemNotFound, which expo-secure-store maps to null.
    if (!entry) return null;
    if (!this.isReadable(entry.accessible)) throw new KeyChainException();
    return entry.value;
  }

  set(key: string, value: string, options?: SecureStore.SecureStoreOptions): void {
    const existing = this.items.get(key);
    if (existing) {
      // SecItemAdd returns errSecDuplicateItem, and expo-secure-store falls
      // through to SecItemUpdate — which rewrites the value only. The
      // protection class the item was inserted with is preserved.
      if (!this.isReadable(existing.accessible)) throw new KeyChainException();
      this.spend();
      existing.value = value;
      return;
    }
    // A fresh insert. Note the library default when no option is supplied —
    // this is the line that reproduces the original bug.
    const accessible = options?.keychainAccessible ?? SecureStore.WHEN_UNLOCKED;
    if (!this.isReadable(accessible)) throw new KeyChainException();
    this.spend();
    this.items.set(key, { value, accessible });
  }

  delete(key: string): void {
    const entry = this.items.get(key);
    if (!entry) return;
    // SecItemDelete cannot match an item whose protection class is locked out;
    // it returns errSecItemNotFound and expo-secure-store ignores the status.
    if (!this.isReadable(entry.accessible)) return;
    this.spend();
    this.items.delete(key);
  }

  /** Seeds a value in the pre-fix layout, as an upgrading install would have. */
  seedLegacy(key: string, value: string, chunkSize = 1800) {
    const safe = 'fbauth_' + key.replace(/[^A-Za-z0-9._-]/g, '_');
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += chunkSize) chunks.push(value.slice(i, i + chunkSize));
    chunks.forEach((c, i) => {
      this.items.set(`${safe}__c${i}`, { value: c, accessible: SecureStore.WHEN_UNLOCKED });
    });
    this.items.set(`${safe}__meta`, {
      value: String(chunks.length),
      accessible: SecureStore.WHEN_UNLOCKED,
    });
  }
}

let keychain: FakeKeychain;

beforeEach(() => {
  keychain = new FakeKeychain();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (k, o) => keychain.get(k, o));
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (k, v, o) => keychain.set(k, v, o));
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (k) => keychain.delete(k));
});

afterEach(() => {
  jest.resetAllMocks();
});

// ─── Firebase behaviour under test ────────────────────────────────────────────
//
// Replicated rather than imported: pulling the RN auth bundle into a `node`
// test environment drags in the whole @firebase/app graph. Both replicas are
// transcribed from firebase 12.17.1 and cited so they can be re-checked on
// upgrade.

/** `STORAGE_AVAILABLE_KEY` — @firebase/auth/dist/rn/index-bWGFqYVI.js:8612 */
const STORAGE_AVAILABLE_KEY = '__sak';

const IN_MEMORY = { name: 'inMemory' as const };

/** `getReactNativePersistence` — @firebase/auth/dist/rn/index.js:53-95 */
function rnPersistence(storage: typeof SecureAuthStorage) {
  return {
    name: 'secureStore' as const,
    async _isAvailable(): Promise<boolean> {
      try {
        await storage.setItem(STORAGE_AVAILABLE_KEY, '1');
        await storage.removeItem(STORAGE_AVAILABLE_KEY);
        return true;
      } catch {
        // The swallow that turns a locked Keychain into a sign-out.
        return false;
      }
    },
    async _get(key: string): Promise<unknown> {
      const json = await storage.getItem(key);
      return json ? JSON.parse(json) : null;
    },
    _set(key: string, value: unknown): Promise<void> {
      return storage.setItem(key, JSON.stringify(value));
    },
    _remove(key: string): Promise<void> {
      return storage.removeItem(key);
    },
  };
}

/**
 * `PersistenceUserManager.create` — @firebase/auth/dist/rn/index-bWGFqYVI.js:2034-2078.
 * Returns what a freshly launched process would resolve to: which persistence
 * won, and whether it recovered a signed-in user.
 */
async function resolveAuthOnLaunch(persistence: ReturnType<typeof rnPersistence>) {
  const available = (await persistence._isAvailable()) ? [persistence] : [];
  let selected: { name: string } = available[0] ?? IN_MEMORY;
  let user: unknown = null;
  try {
    const blob = await persistence._get(AUTH_KEY);
    if (blob) {
      user = blob;
      selected = persistence;
    }
  } catch {
    // `catch {}` in the SDK — a locked-Keychain throw is invisible here.
  }
  return { persistenceUsed: selected.name, user };
}

// ─── Defect 1: Keychain protection class ─────────────────────────────────────

describe('Keychain protection class', () => {
  it('writes every item as AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    expect(keychain.items.size).toBeGreaterThan(0);
    for (const [key, entry] of keychain.items) {
      expect([key, entry.accessible]).toEqual([
        key,
        SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      ]);
    }
  });

  it('passes the protection class on reads and deletes too, not just writes', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);
    await SecureAuthStorage.getItem(AUTH_KEY);
    await SecureAuthStorage.removeItem(AUTH_KEY);

    const optionsSeen = [
      ...jest.mocked(SecureStore.getItemAsync).mock.calls.map((c) => c[1]),
      ...jest.mocked(SecureStore.setItemAsync).mock.calls.map((c) => c[2]),
      ...jest.mocked(SecureStore.deleteItemAsync).mock.calls.map((c) => c[1]),
    ];

    expect(optionsSeen.length).toBeGreaterThan(0);
    for (const options of optionsSeen) {
      expect(options?.keychainAccessible).toBe(SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    }
  });

  it('reads back the stored value while the device is locked', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    keychain.lock();

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(USER_BLOB);
  });

  it('still writes a token refresh that lands while the device is locked', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    keychain.lock();
    const refreshed = USER_BLOB.replace('test-uid-123', 'test-uid-123-refreshed');
    await SecureAuthStorage.setItem(AUTH_KEY, refreshed);

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(refreshed);
  });
});

// ─── Defect 1, end to end: the reported symptom ──────────────────────────────

describe('background launch from a silent push (the reported bug)', () => {
  it('keeps the user signed in when the app is woken on a locked device', async () => {
    const persistence = rnPersistence(SecureAuthStorage);

    // Signed in earlier, phone in hand.
    await persistence._set(AUTH_KEY, { uid: 'test-uid-123', blob: USER_BLOB });

    // Midnight. Phone locked on the nightstand. The rollover push
    // (_contentAvailable: true) launches the app into the background.
    keychain.lock();

    const { persistenceUsed, user } = await resolveAuthOnLaunch(persistence);

    // Pre-fix this resolved to 'inMemory' with user null, which is what routed
    // the user to /(startup)/welcome on their next foreground.
    expect(persistenceUsed).toBe('secureStore');
    expect(user).toMatchObject({ uid: 'test-uid-123' });
  });

  it('survives a lock/unlock cycle across repeated background wakes', async () => {
    const persistence = rnPersistence(SecureAuthStorage);
    await persistence._set(AUTH_KEY, { uid: 'test-uid-123' });

    for (let wake = 0; wake < 5; wake++) {
      keychain.lock();
      const locked = await resolveAuthOnLaunch(persistence);
      expect(locked).toMatchObject({ persistenceUsed: 'secureStore' });
      expect(locked.user).toMatchObject({ uid: 'test-uid-123' });

      keychain.unlock();
      const unlocked = await resolveAuthOnLaunch(persistence);
      expect(unlocked.user).toMatchObject({ uid: 'test-uid-123' });
    }
  });

  it('reports storage failure as an error, never as "no user signed in"', async () => {
    // After a reboot and before the first passcode entry, even
    // AFTER_FIRST_UNLOCK is unavailable. Nothing can be read — but getItem must
    // not paper over that by resolving null, which would assert the user is
    // signed out. Callers need to be able to tell the two apart.
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);
    keychain.reboot();

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).rejects.toThrow(KeyChainException);

    keychain.unlock();
    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(USER_BLOB);
  });
});

// ─── Defect 2: torn writes ───────────────────────────────────────────────────

describe('write atomicity', () => {
  const NEXT_BLOB = JSON.stringify({ uid: 'second-uid', padding: 'z'.repeat(4000) });

  it('leaves the previous value intact if the process dies mid-write', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    // A full rewrite takes several Keychain ops. Kill the process at each one
    // in turn and assert the stored value is never observably damaged.
    const opsInFullWrite = 12;
    for (let killAt = 0; killAt < opsInFullWrite; killAt++) {
      keychain.killAfter(killAt);
      await SecureAuthStorage.setItem(AUTH_KEY, NEXT_BLOB).catch((err) => {
        if (!(err instanceof ProcessKilled)) throw err;
      });
      keychain.killAfter(Infinity);

      // Either the old value or the new one — never null, never a fragment.
      const value = await SecureAuthStorage.getItem(AUTH_KEY);
      expect([USER_BLOB, NEXT_BLOB]).toContain(value);
    }
  });

  it('does not leave a readable fragment when a shorter value replaces a longer one', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, 'x'.repeat(9000));
    const short = JSON.stringify({ uid: 'short' });
    await SecureAuthStorage.setItem(AUTH_KEY, short);

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(short);
  });

  it('reads as absent, not as a fragment, if removeItem is interrupted', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    keychain.killAfter(1); // enough to drop a pointer, not the chunks
    await SecureAuthStorage.removeItem(AUTH_KEY).catch((err) => {
      if (!(err instanceof ProcessKilled)) throw err;
    });
    keychain.killAfter(Infinity);

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBeNull();
  });

  it('does not accumulate orphaned chunks across many token refreshes', async () => {
    for (let refresh = 0; refresh < 20; refresh++) {
      await SecureAuthStorage.setItem(AUTH_KEY, `${USER_BLOB}${refresh}`);
    }

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(`${USER_BLOB}19`);
    // One meta pointer plus one live generation of a ~2.5 KB blob.
    expect(keychain.items.size).toBeLessThanOrEqual(4);
  });
});

// ─── Migration ───────────────────────────────────────────────────────────────

describe('upgrade from the pre-fix layout', () => {
  it('does not sign out users who already have a value in the old namespace', async () => {
    keychain.seedLegacy(AUTH_KEY, USER_BLOB);

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(USER_BLOB);
  });

  it('rewrites legacy items under the correct protection class on next write', async () => {
    keychain.seedLegacy(AUTH_KEY, USER_BLOB);

    // The hourly token refresh after the update.
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    for (const [key, entry] of keychain.items) {
      expect([key, entry.accessible]).toEqual([
        key,
        SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      ]);
    }
    expect([...keychain.items.keys()].some((k) => k.startsWith('fbauth_'))).toBe(false);

    // And the migrated value survives a lock, which the legacy one would not.
    keychain.lock();
    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(USER_BLOB);
  });

  it('clears both namespaces on sign-out', async () => {
    keychain.seedLegacy(AUTH_KEY, USER_BLOB);
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);
    await SecureAuthStorage.removeItem(AUTH_KEY);

    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect(keychain.items.size).toBe(0);
  });
});

// ─── Round-trip ──────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it.each([
    ['empty', ''],
    ['short', 'a'],
    ['exactly one chunk', 'b'.repeat(1800)],
    ['one byte over a chunk', 'c'.repeat(1801)],
    ['a realistic user blob', USER_BLOB],
    ['unicode', '{"name":"Delaluna 🌙","note":"ñ ü 中文"}'],
  ])('preserves %s exactly', async (_label, value) => {
    await SecureAuthStorage.setItem(AUTH_KEY, value);
    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBe(value);
  });

  it('returns null for a key that was never written', async () => {
    await expect(SecureAuthStorage.getItem(AUTH_KEY)).resolves.toBeNull();
  });

  it('encodes keys into the character set SecureStore accepts', async () => {
    await SecureAuthStorage.setItem(AUTH_KEY, USER_BLOB);

    for (const key of keychain.items.keys()) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});
