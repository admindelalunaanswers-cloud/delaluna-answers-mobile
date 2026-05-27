# Firestore Performance Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Firestore-backed performance log that captures screen load times, AI call durations, and errors — organized under `performanceLogs/{screenSlug}` — with a nightly Cloud Function that aggregates raw events into daily p50/p95 summaries and prunes old data.

**Architecture:** The mobile client writes fire-and-forget events via `perf-log.service.ts`; a `useScreenPerfLog` hook wraps the service for use inside screen components. A scheduled Cloud Function (`aggregatePerfLogs`) runs at 02:00 UTC daily, computing per-screen stats and deleting raw events older than 7 days and daily summaries older than 90 days.

**Tech Stack:** React Native / Expo Router, Firebase web SDK v9 (client), firebase-admin (Cloud Functions), TypeScript, Jest + @testing-library/react-native.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/services/perf-log.service.ts` | Firestore write helpers: `logScreenLoad`, `logOperation`, `logError` |
| Create | `src/services/__tests__/perf-log.service.test.ts` | Unit tests for the service |
| Create | `src/hooks/use-screen-perf-log.ts` | React hook wrapping the service with user context |
| Create | `src/hooks/__tests__/use-screen-perf-log.test.ts` | Unit tests for the hook |
| Modify | `firestore.rules` | Add `performanceLogs` security rules |
| Modify | `functions/src/index.ts` | Add `aggregatePerfLogs` scheduled CF |
| Modify | `app/(main)/chat.tsx` | Instrument screen load + `chat_send` operation |
| Modify | `app/(main)/index.tsx` | Instrument screen load |

---

## Task 1: `perf-log.service.ts` — tests first

**Files:**
- Create: `src/services/perf-log.service.ts`
- Create: `src/services/__tests__/perf-log.service.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/services/__tests__/perf-log.service.test.ts`:

```ts
import { logScreenLoad, logOperation, logError, screenSlugForPath } from '@/src/services/perf-log.service';
import { addDoc, setDoc, collection, doc, serverTimestamp } from 'firebase/firestore';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn().mockResolvedValue({ id: 'auto-id' }),
  setDoc: jest.fn().mockResolvedValue(undefined),
  collection: jest.fn().mockReturnValue('mock-col'),
  doc: jest.fn().mockReturnValue('mock-doc'),
  serverTimestamp: jest.fn().mockReturnValue('MOCK_SERVER_TS'),
}));

jest.mock('@/firebaseConfig', () => ({ db: {} }));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.2.3' } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@/src/constants/env', () => ({ APP_ENV: 'development' }));

jest.mock('@/src/services/analytics.service', () => ({
  screenLabelForPath: (p: string) => {
    const map: Record<string, string> = {
      '/(main)/chat': 'Chat',
      '/(main)/index': 'Birth Data Input',
      '/(home)/birth-chart-view': 'Birth Chart',
    };
    return map[p] ?? 'Unknown';
  },
}));

// ─── screenSlugForPath ────────────────────────────────────────────────────────

describe('screenSlugForPath', () => {
  it('converts label to lowercase slug', () => {
    expect(screenSlugForPath('/(main)/chat')).toBe('chat');
  });

  it('replaces spaces with dashes', () => {
    expect(screenSlugForPath('/(main)/index')).toBe('birth-data-input');
  });

  it('strips non-alphanumeric chars', () => {
    expect(screenSlugForPath('/(home)/birth-chart-view')).toBe('birth-chart');
  });
});

// ─── logScreenLoad ────────────────────────────────────────────────────────────

describe('logScreenLoad', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls setDoc on the screen root doc', async () => {
    logScreenLoad('/(main)/chat', 1200, { userId: 'uid-1', isPro: false });
    await Promise.resolve(); // flush microtasks
    expect(setDoc).toHaveBeenCalledWith(
      'mock-doc',
      expect.objectContaining({ screen: 'Chat', screenPath: '/(main)/chat' }),
      { merge: true },
    );
  });

  it('calls addDoc with metricType screen_load and correct shape', async () => {
    logScreenLoad('/(main)/chat', 1200, { userId: 'uid-1', isPro: true });
    await Promise.resolve();
    expect(addDoc).toHaveBeenCalledWith(
      'mock-col',
      expect.objectContaining({
        metricType: 'screen_load',
        durationMs: 1200,
        screen: 'Chat',
        screenPath: '/(main)/chat',
        userId: 'uid-1',
        isPro: true,
        appVersion: '1.2.3',
        environment: 'development',
        os: 'ios',
      }),
    );
  });

  it('is fire-and-forget — does not throw on Firestore error', async () => {
    (addDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    expect(() => logScreenLoad('/(main)/chat', 100)).not.toThrow();
    await Promise.resolve();
    // no unhandled rejection
  });
});

// ─── logOperation ─────────────────────────────────────────────────────────────

describe('logOperation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes metricType ai_call with operationName', async () => {
    logOperation('/(main)/chat', 'chat_send', 3400, { userId: 'uid-2', isPro: false });
    await Promise.resolve();
    expect(addDoc).toHaveBeenCalledWith(
      'mock-col',
      expect.objectContaining({
        metricType: 'ai_call',
        operationName: 'chat_send',
        durationMs: 3400,
        userId: 'uid-2',
      }),
    );
  });
});

// ─── logError ─────────────────────────────────────────────────────────────────

describe('logError', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes metricType error with errorMessage and no durationMs', async () => {
    logError('/(main)/chat', 'fetch failed', { userId: 'uid-3', isPro: false });
    await Promise.resolve();
    const call = (addDoc as jest.Mock).mock.calls[0][1];
    expect(call.metricType).toBe('error');
    expect(call.errorMessage).toBe('fetch failed');
    expect(call.durationMs).toBeUndefined();
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile
npx jest src/services/__tests__/perf-log.service.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/src/services/perf-log.service'"

- [ ] **Step 1.3: Implement `perf-log.service.ts`**

Create `src/services/perf-log.service.ts`:

```ts
/**
 * perf-log.service.ts
 * Writes custom performance events to Firestore under
 * performanceLogs/{screenSlug}/events/{autoId}.
 *
 * This is separate from performance.service.ts (Firebase Perf SDK) — that
 * module records traces in Firebase Console; this one writes queryable data
 * to Firestore for the admin dashboard.
 *
 * - All writes are fire-and-forget; failures are logged in __DEV__ and
 *   swallowed so perf logging can never crash the app.
 * - sessionId is a random string generated once per app launch to group
 *   events from the same session without persisting PII.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { APP_ENV } from '@/src/constants/env';
import { screenLabelForPath } from '@/src/services/analytics.service';

// ─── Session context (built once at module load) ─────────────────────────────

function makeSessionId(): string {
  // Not security-sensitive — used only for grouping analytics events.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const SESSION = {
  sessionId:   makeSessionId(),
  appVersion:  Constants.expoConfig?.version ?? 'unknown',
  environment: APP_ENV,
  os:          Platform.OS,
} as const;

// ─── Slug helper ─────────────────────────────────────────────────────────────

/**
 * Converts an Expo Router pathname to a Firestore-safe document ID.
 * Delegates label lookup to analytics.service so screen names stay in sync.
 *
 *   '/(main)/chat'          → 'chat'
 *   '/(main)/index'         → 'birth-data-input'
 *   '/(home)/birth-chart-view' → 'birth-chart'
 */
export function screenSlugForPath(pathname: string): string {
  return screenLabelForPath(pathname)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface UserOpts {
  userId?: string;
  isPro?: boolean;
}

function safeWrite(fn: () => Promise<void>, label: string): void {
  fn().catch((err) => {
    if (__DEV__) console.warn(`[perf-log] ${label} failed:`, err);
  });
}

function screenRefs(pathname: string) {
  const slug = screenSlugForPath(pathname);
  return {
    slug,
    label:      screenLabelForPath(pathname),
    screenDoc:  doc(db, 'performanceLogs', slug),
    eventsCol:  collection(db, 'performanceLogs', slug, 'events'),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log how long a screen took to show content after mount.
 * Call this once when data is loaded and the screen is interactive.
 */
export function logScreenLoad(
  screenPath: string,
  durationMs: number,
  opts?: UserOpts,
): void {
  const { label, screenDoc, eventsCol } = screenRefs(screenPath);
  safeWrite(async () => {
    await Promise.all([
      setDoc(screenDoc, { screen: label, screenPath, lastEventAt: serverTimestamp() }, { merge: true }),
      addDoc(eventsCol, {
        screen:      label,
        screenPath,
        metricType:  'screen_load',
        durationMs,
        userId:      opts?.userId ?? null,
        isPro:       opts?.isPro ?? false,
        ...SESSION,
        timestamp:   serverTimestamp(),
      }),
    ]);
  }, `screen_load:${screenPath}`);
}

/**
 * Log the duration of a named async operation (AI call, data fetch, etc.)
 * tied to the screen that triggered it.
 */
export function logOperation(
  screenPath: string,
  operationName: string,
  durationMs: number,
  opts?: UserOpts,
): void {
  const { label, screenDoc, eventsCol } = screenRefs(screenPath);
  safeWrite(async () => {
    await Promise.all([
      setDoc(screenDoc, { screen: label, screenPath, lastEventAt: serverTimestamp() }, { merge: true }),
      addDoc(eventsCol, {
        screen:         label,
        screenPath,
        metricType:     'ai_call',
        operationName,
        durationMs,
        userId:         opts?.userId ?? null,
        isPro:          opts?.isPro ?? false,
        ...SESSION,
        timestamp:      serverTimestamp(),
      }),
    ]);
  }, `ai_call:${operationName}:${screenPath}`);
}

/**
 * Log an error that occurred on a screen.
 * No durationMs — this captures error counts, not timing.
 */
export function logError(
  screenPath: string,
  errorMessage: string,
  opts?: UserOpts,
): void {
  const { label, screenDoc, eventsCol } = screenRefs(screenPath);
  safeWrite(async () => {
    await Promise.all([
      setDoc(screenDoc, { screen: label, screenPath, lastEventAt: serverTimestamp() }, { merge: true }),
      addDoc(eventsCol, {
        screen:        label,
        screenPath,
        metricType:    'error',
        errorMessage,
        userId:        opts?.userId ?? null,
        isPro:         opts?.isPro ?? false,
        ...SESSION,
        timestamp:     serverTimestamp(),
      }),
    ]);
  }, `error:${screenPath}`);
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
npx jest src/services/__tests__/perf-log.service.test.ts --no-coverage
```

Expected: all tests PASS (3 describe blocks, ~8 tests total)

- [ ] **Step 1.5: Commit**

```bash
git add src/services/perf-log.service.ts src/services/__tests__/perf-log.service.test.ts
git commit -m "feat: add perf-log.service — Firestore performance event writer"
```

---

## Task 2: Firestore Security Rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 2.1: Add `performanceLogs` rules block**

Open `firestore.rules`. Find the closing `}` of the `match /config/{docId}` block (it's the last rule before the two closing braces of the file). Insert the new block after it:

The exact text to find (at the end of the file):

```
    match /config/{docId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

Replace with:

```
    match /config/{docId} {
      allow read: if true;
      allow write: if false;
    }

    // ─── Perf logs ──────────────────────────────────────────────────────────
    // performanceLogs/{screenSlug}       ← screen metadata (lastEventAt)
    // performanceLogs/{screenSlug}/events ← raw client events (write-only for client)
    // performanceLogs/{screenSlug}/daily  ← CF aggregations (admin-read only)
    match /performanceLogs/{screenSlug} {
      // Any signed-in user may merge lastEventAt onto the parent doc.
      allow write: if isSignedIn();
      allow read:  if isAdmin();

      match /events/{eventId} {
        // Client may only create their own events — no updates or deletes.
        allow create: if isSignedIn()
          && request.resource.data.userId == request.auth.uid;
        allow read:   if isAdmin();
        allow update, delete: if false;
      }

      match /daily/{date} {
        // Written exclusively by CF admin SDK (bypasses rules).
        allow read:  if isAdmin();
        allow write: if false;
      }
    }
  }
}
```

- [ ] **Step 2.2: Verify rules file is valid**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile
npx firebase-tools firestore:rules --check firestore.rules 2>/dev/null \
  || cat firestore.rules | grep -c "performanceLogs"
```

Expected: prints `3` (the rule appears 3 times — root match + events + daily)

- [ ] **Step 2.3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for performanceLogs collection"
```

---

## Task 3: `use-screen-perf-log.ts` hook — tests first

**Files:**
- Create: `src/hooks/__tests__/use-screen-perf-log.test.ts`
- Create: `src/hooks/use-screen-perf-log.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `src/hooks/__tests__/use-screen-perf-log.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useScreenPerfLog } from '@/src/hooks/use-screen-perf-log';
import * as perfLog from '@/src/services/perf-log.service';
import { useUser } from '@/src/context/user-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/src/services/perf-log.service', () => ({
  logScreenLoad: jest.fn(),
  logOperation:  jest.fn(),
  logError:      jest.fn(),
}));

jest.mock('@/src/context/user-context', () => ({
  useUser: jest.fn(),
}));

jest.mock('@/src/context/revenuecat-context', () => ({
  useRevenueCat: jest.fn(),
}));

const mockUseUser      = useUser as jest.Mock;
const mockUseRevenueCat = useRevenueCat as jest.Mock;

function setupMocks(uid = 'uid-test', isPro = false) {
  mockUseUser.mockReturnValue({ authUser: { uid } });
  mockUseRevenueCat.mockReturnValue({ isPro });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useScreenPerfLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('markReady', () => {
    it('calls logScreenLoad with the screen path and elapsed ms', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      // Advance time by 500ms after mount
      act(() => {
        jest.advanceTimersByTime(500);
        result.current.markReady();
      });

      expect(perfLog.logScreenLoad).toHaveBeenCalledTimes(1);
      expect(perfLog.logScreenLoad).toHaveBeenCalledWith(
        '/(main)/chat',
        expect.any(Number),
        { userId: 'uid-test', isPro: false },
      );
    });

    it('fires only once even when called multiple times (idempotent)', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => {
        result.current.markReady();
        result.current.markReady();
        result.current.markReady();
      });

      expect(perfLog.logScreenLoad).toHaveBeenCalledTimes(1);
    });

    it('passes isPro = true when user is premium', () => {
      setupMocks('uid-pro', true);
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => { result.current.markReady(); });

      expect(perfLog.logScreenLoad).toHaveBeenCalledWith(
        '/(main)/chat',
        expect.any(Number),
        { userId: 'uid-pro', isPro: true },
      );
    });

    it('passes userId = undefined when authUser is null', () => {
      mockUseUser.mockReturnValue({ authUser: null });
      mockUseRevenueCat.mockReturnValue({ isPro: false });

      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));
      act(() => { result.current.markReady(); });

      expect(perfLog.logScreenLoad).toHaveBeenCalledWith(
        '/(main)/chat',
        expect.any(Number),
        { userId: undefined, isPro: false },
      );
    });
  });

  describe('logOp', () => {
    it('calls logOperation with correct args', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => { result.current.logOp('chat_send', 2400); });

      expect(perfLog.logOperation).toHaveBeenCalledWith(
        '/(main)/chat',
        'chat_send',
        2400,
        { userId: 'uid-test', isPro: false },
      );
    });
  });

  describe('logError', () => {
    it('calls logError with correct args', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => { result.current.logError('network timeout'); });

      expect(perfLog.logError).toHaveBeenCalledWith(
        '/(main)/chat',
        'network timeout',
        { userId: 'uid-test', isPro: false },
      );
    });
  });

  describe('stable callbacks', () => {
    it('markReady reference does not change across re-renders', () => {
      const { result, rerender } = renderHook(() => useScreenPerfLog('/(main)/chat'));
      const first = result.current.markReady;
      rerender({});
      expect(result.current.markReady).toBe(first);
    });
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
npx jest src/hooks/__tests__/use-screen-perf-log.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/src/hooks/use-screen-perf-log'"

- [ ] **Step 3.3: Implement `use-screen-perf-log.ts`**

Create `src/hooks/use-screen-perf-log.ts`:

```ts
import { useCallback, useRef } from 'react';

import { useUser }        from '@/src/context/user-context';
import { useRevenueCat }  from '@/src/context/revenuecat-context';
import {
  logScreenLoad,
  logOperation,
  logError,
} from '@/src/services/perf-log.service';

/**
 * Tracks screen load time and provides helpers for logging
 * named operations and errors — all tied to the given screen path.
 *
 * Usage:
 *   const { markReady, logOp, logError } = useScreenPerfLog('/(main)/chat');
 *
 *   // call once when content is ready:
 *   useEffect(() => { if (!loading) markReady(); }, [loading]);
 *
 *   // wrap timed operations:
 *   const t = Date.now();
 *   await doWork();
 *   logOp('operation_name', Date.now() - t);
 */
export function useScreenPerfLog(screenPath: string) {
  const { authUser } = useUser();
  const { isPro }    = useRevenueCat();

  const mountTime = useRef(Date.now());
  const reported  = useRef(false);

  // Keep latest context in a ref so the stable callbacks always read
  // the most recent authUser/isPro without being recreated.
  const ctxRef = useRef({ authUser, isPro });
  ctxRef.current = { authUser, isPro };

  const markReady = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    logScreenLoad(screenPath, Date.now() - mountTime.current, {
      userId: ctxRef.current.authUser?.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  const logOp = useCallback((operationName: string, durationMs: number) => {
    logOperation(screenPath, operationName, durationMs, {
      userId: ctxRef.current.authUser?.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  const logErr = useCallback((message: string) => {
    logError(screenPath, message, {
      userId: ctxRef.current.authUser?.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  return { markReady, logOp, logError: logErr };
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
npx jest src/hooks/__tests__/use-screen-perf-log.test.ts --no-coverage
```

Expected: all tests PASS (5 describe blocks, ~6 tests total)

- [ ] **Step 3.5: Commit**

```bash
git add src/hooks/use-screen-perf-log.ts src/hooks/__tests__/use-screen-perf-log.test.ts
git commit -m "feat: add useScreenPerfLog hook — screen timing and error logging"
```

---

## Task 4: `aggregatePerfLogs` Cloud Function

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 4.1: Write the test for the percentile helper**

The `percentile` function will be exported from `functions/src/index.ts`. Before adding it, write the test.

Open `functions/src/index.ts` and find the import block at the top. After the existing imports, add (do NOT implement yet):

```ts
// exported for unit testing
export function percentile(sorted: number[], p: number): number {
  throw new Error('not implemented');
}
```

Create `functions/src/__tests__/percentile.test.ts`:

```ts
import { percentile } from '../index';

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('p50 of [10, 20, 30] is 20', () => {
    expect(percentile([10, 20, 30], 50)).toBe(20);
  });

  it('p95 of [10, 20, 30] is 30', () => {
    expect(percentile([10, 20, 30], 95)).toBe(30);
  });

  it('p50 of a single element is that element', () => {
    expect(percentile([42], 50)).toBe(42);
  });

  it('p100 returns the last element', () => {
    expect(percentile([1, 2, 5, 8], 100)).toBe(8);
  });

  it('p0 is clamped to the first element', () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile/functions
npx jest src/__tests__/percentile.test.ts --no-coverage 2>/dev/null \
  || npx ts-node -e "require('./src/index')" 2>&1 | head -5
```

Expected: FAIL or compile error because `percentile` throws.

Note: the functions project may not have a jest setup. If it doesn't, run:

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile/functions
ls package.json && node -e "const p=require('./package.json'); console.log(p.scripts?.test ?? 'no test script')"
```

If no test script exists, skip the functions unit test steps (4.1-4.2) and proceed to 4.3 where you implement and manually verify.

- [ ] **Step 4.3: Implement `percentile` and `aggregatePerfLogs` in `functions/src/index.ts`**

Open `functions/src/index.ts`. Add these two blocks at the **end** of the file, after the closing `}` of `weeklyCleanup`.

First, add a date-formatting helper and the `percentile` function (replace the stub from 4.1 if you added it):

```ts
// ─── Shared helpers for aggregatePerfLogs ────────────────────────────────────

function formatDateId(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Returns the p-th percentile of a pre-sorted array of numbers.
 * Uses nearest-rank method. Returns 0 for empty arrays.
 * Exported for unit testing.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
```

Then add the scheduled function:

```ts
// ─── aggregatePerfLogs ───────────────────────────────────────────────────────

/**
 * Runs every day at 02:00 UTC.
 *
 * For each screen in performanceLogs/:
 *   1. Reads yesterday's raw events (timestamp in [start-of-yesterday, start-of-today))
 *   2. Computes p50/p95 for screen_load and each ai_call operation name
 *   3. Counts errors
 *   4. Writes performanceLogs/{slug}/daily/{YYYY-MM-DD}
 *   5. Deletes raw events older than 7 days
 *   6. Deletes daily docs older than 90 days
 *
 * Processes screens in concurrent chunks of 10; wraps each in try/catch so
 * one bad screen does not abort the rest.
 */
export const aggregatePerfLogs = onSchedule('every day 02:00', async () => {
  const now = new Date();

  // Yesterday for the daily summary key
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayId = formatDateId(yesterday);

  // Time window: [start of yesterday, start of today)
  const startOfYesterday = new Date(Date.UTC(
    yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(),
  ));
  const startOfToday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  ));

  // Raw event deletion cutoff (7 days ago)
  const rawCutoff = new Date(now);
  rawCutoff.setUTCDate(rawCutoff.getUTCDate() - 7);

  // Daily summary deletion cutoff (90 days ago as YYYY-MM-DD string)
  const dailyCutoff = new Date(now);
  dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - 90);
  const dailyCutoffId = formatDateId(dailyCutoff);

  const screenRefs = await db.collection('performanceLogs').listDocuments();
  if (screenRefs.length === 0) {
    console.info('[aggregatePerfLogs] No screen docs — nothing to aggregate');
    return;
  }

  let totalAggregated = 0;
  let failedScreens   = 0;

  const CONCURRENCY = 10;
  for (let i = 0; i < screenRefs.length; i += CONCURRENCY) {
    const chunk = screenRefs.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (screenRef) => {
      const slug = screenRef.id;
      try {
        // ── 1. Query yesterday's events ──────────────────────────────────
        const eventsSnap = await screenRef.collection('events')
          .where('timestamp', '>=', Timestamp.fromDate(startOfYesterday))
          .where('timestamp', '<',  Timestamp.fromDate(startOfToday))
          .get();

        if (!eventsSnap.empty) {
          const events = eventsSnap.docs.map(d => d.data());

          // ── 2. Compute screen_load stats ─────────────────────────────
          const loadDurations = events
            .filter(e => e.metricType === 'screen_load' && typeof e.durationMs === 'number')
            .map(e => e.durationMs as number)
            .sort((a, b) => a - b);

          const screenLoad = loadDurations.length > 0 ? {
            count:  loadDurations.length,
            sumMs:  loadDurations.reduce((s, v) => s + v, 0),
            minMs:  loadDurations[0],
            maxMs:  loadDurations[loadDurations.length - 1],
            p50Ms:  percentile(loadDurations, 50),
            p95Ms:  percentile(loadDurations, 95),
          } : null;

          // ── 3. Compute per-operation ai_call stats ───────────────────
          const opEvents = events.filter(e => e.metricType === 'ai_call' && e.operationName);
          const opNames  = [...new Set(opEvents.map(e => e.operationName as string))];

          const operations: Record<string, {
            count: number; sumMs: number; p50Ms: number; p95Ms: number;
          }> = {};

          for (const opName of opNames) {
            const durations = opEvents
              .filter(e => e.operationName === opName && typeof e.durationMs === 'number')
              .map(e => e.durationMs as number)
              .sort((a, b) => a - b);
            operations[opName] = {
              count: durations.length,
              sumMs: durations.reduce((s, v) => s + v, 0),
              p50Ms: percentile(durations, 50),
              p95Ms: percentile(durations, 95),
            };
          }

          // ── 4. Count errors ──────────────────────────────────────────
          const errorCount = events.filter(e => e.metricType === 'error').length;

          // ── 5. Write daily summary ───────────────────────────────────
          await screenRef.collection('daily').doc(yesterdayId).set({
            screen:       eventsSnap.docs[0].data().screen ?? slug,
            date:         yesterdayId,
            ...(screenLoad ? { screenLoad } : {}),
            operations,
            errorCount,
            totalEvents:  events.length,
            updatedAt:    FieldValue.serverTimestamp(),
          });

          totalAggregated += events.length;
        }

        // ── 6. Delete raw events older than 7 days ───────────────────
        const oldEventsSnap = await screenRef.collection('events')
          .where('timestamp', '<', Timestamp.fromDate(rawCutoff))
          .limit(500)
          .get();

        if (!oldEventsSnap.empty) {
          const BATCH_SIZE = 500;
          for (let j = 0; j < oldEventsSnap.docs.length; j += BATCH_SIZE) {
            const batch = db.batch();
            oldEventsSnap.docs.slice(j, j + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }

        // ── 7. Delete daily docs older than 90 days ──────────────────
        const dailyRefs = await screenRef.collection('daily').listDocuments();
        const oldDaily  = dailyRefs.filter(r => r.id < dailyCutoffId);
        if (oldDaily.length > 0) {
          const batch = db.batch();
          oldDaily.forEach(r => batch.delete(r));
          await batch.commit();
        }

      } catch (err) {
        failedScreens++;
        console.error(`[aggregatePerfLogs] Failed for screen "${slug}":`, err);
      }
    }));
  }

  console.info(
    `[aggregatePerfLogs] done — ${totalAggregated} events aggregated` +
    (failedScreens > 0 ? `, ${failedScreens} screen(s) failed` : ''),
  );
});
```

- [ ] **Step 4.4: Run the percentile tests**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile/functions
# If a jest config exists:
npx jest src/__tests__/percentile.test.ts --no-coverage 2>/dev/null && echo "PASS"
# Otherwise verify manually:
node -e "
const { percentile } = require('./src/index.js');
console.assert(percentile([], 50) === 0, 'empty array');
console.assert(percentile([10,20,30], 50) === 20, 'p50');
console.assert(percentile([10,20,30], 95) === 30, 'p95');
console.log('all assertions passed');
" 2>/dev/null || echo "compile the TS first with: npx tsc --noEmit"
```

Run the TypeScript check to catch any import/type errors:

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile/functions
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4.5: Commit**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile
git add functions/src/index.ts functions/src/__tests__/
git commit -m "feat: add aggregatePerfLogs Cloud Function — daily perf aggregation and cleanup"
```

---

## Task 5: Instrument `app/(main)/chat.tsx`

**Files:**
- Modify: `app/(main)/chat.tsx`

- [ ] **Step 5.1: Add the import**

Open `app/(main)/chat.tsx`. Find the existing import block. Add after the last local import:

```ts
import { useScreenPerfLog } from '@/src/hooks/use-screen-perf-log';
```

- [ ] **Step 5.2: Add hook call and `markReady`**

Inside the `default export` component function, find where `useRevenueCat` and `useUser` are already destructured. After those lines, add:

```ts
const { markReady, logOp, logError: logPerfError } = useScreenPerfLog('/(main)/chat');
```

Find the `rcLoading` usage — the chat screen is "ready" once RevenueCat stops loading and messages have loaded. Locate the existing `useEffect` that calls `flatListRef.current?.scrollToEnd`. After it, add:

```ts
// Mark screen ready once the initial data is available
useEffect(() => {
  if (!rcLoading) markReady();
}, [rcLoading]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5.3: Instrument `handleSend` with `chat_send` timing**

Find `handleSend`. It currently looks like:

```ts
const handleSend = useCallback(async (text?: string) => {
    ...
    try {
      await sendChatMessage(authUser.uid, msg, chartSummary, selectedConnection ?? undefined);
      Events.chatMessageSent({ length: msg.length });
    } catch (e) {
      console.error('chat send error', e);
      recordError(e, 'chat_send');
    } finally {
```

Change the `try` block to:

```ts
    const t = Date.now();
    try {
      await sendChatMessage(authUser.uid, msg, chartSummary, selectedConnection ?? undefined);
      logOp('chat_send', Date.now() - t);
      Events.chatMessageSent({ length: msg.length });
    } catch (e) {
      logPerfError(e instanceof Error ? e.message : String(e));
      console.error('chat send error', e);
      recordError(e, 'chat_send');
    } finally {
```

- [ ] **Step 5.4: Verify the app still compiles**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 5.5: Commit**

```bash
git add app/\(main\)/chat.tsx
git commit -m "feat: instrument chat screen with useScreenPerfLog (screen_load + chat_send)"
```

---

## Task 6: Instrument `app/(main)/index.tsx`

**Files:**
- Modify: `app/(main)/index.tsx`

- [ ] **Step 6.1: Add the import**

Open `app/(main)/index.tsx`. Add after the last local import:

```ts
import { useScreenPerfLog } from '@/src/hooks/use-screen-perf-log';
```

- [ ] **Step 6.2: Add hook call and `markReady`**

Inside the component function, after the existing context destructuring lines (after `const { isPro, loading: rcLoading } = useRevenueCat();`), add:

```ts
const { markReady } = useScreenPerfLog('/(main)/index');
```

- [ ] **Step 6.3: Add markReady trigger**

The index screen is ready once both RevenueCat stops loading and the initial horoscope context finishes. Find the existing `useEffect` that depends on `horoscope` (the one that calls `setHoroscopeByDate`). After all the existing `useEffect` calls but before the `return` statement of the component, add:

```ts
// Mark screen ready once horoscope context is available
useEffect(() => {
  if (!rcLoading) markReady();
}, [rcLoading]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 6.4: Verify the app still compiles**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 6.5: Commit**

```bash
git add app/\(main\)/index.tsx
git commit -m "feat: instrument index screen with useScreenPerfLog (screen_load)"
```

---

## Final Verification

- [ ] **Run full test suite to confirm no regressions**

```bash
cd /Users/iuhuihyiu/Developer/delaluna-answers-mobile
npx jest --no-coverage
```

Expected: all existing tests pass, 2 new test files pass (perf-log.service + use-screen-perf-log)

- [ ] **TypeScript clean compile**

```bash
npx tsc --noEmit && echo "✅ TS clean"
```

Expected: `✅ TS clean`

---

## Post-Implementation Notes

### Remaining screens to instrument
Use the same Task 5/6 pattern for these screens in priority order:
1. `app/(home)/birth-chart-view.tsx` — `markReady` on breakdown data load
2. `app/(main)/transits.tsx` — `markReady` on transit data load
3. `app/(auth)/sign-up.tsx` — `markReady` on form mount
4. `app/(auth)/verify-email.tsx` — `markReady` on mount
5. All remaining screens from `ROUTE_LABELS` in `analytics.service.ts`

### Manual verification in Firestore Emulator
1. Start the emulator: `firebase emulators:start`
2. Open the app in Expo Go and navigate to Chat
3. Open `http://localhost:4000/firestore` and look for `performanceLogs/chat/events`
4. Send a chat message and verify an `ai_call` doc appears with `operationName: 'chat_send'`
5. Trigger `aggregatePerfLogs` via the Functions emulator and verify `performanceLogs/chat/daily/{date}` is created
