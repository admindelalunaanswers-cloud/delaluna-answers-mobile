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

// ─── Session context ────────────────────────────────────────────────────────
// sessionId is generated once at module load; other fields are gathered at call time.

function makeSessionId(): string {
  // Not security-sensitive — used only for grouping analytics events.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const STATIC_SESSION_ID = makeSessionId();

function getSessionData() {
  return {
    sessionId:   STATIC_SESSION_ID,
    appVersion:  Constants.expoConfig?.version ?? 'unknown',
    environment: APP_ENV,
    os:          Platform.OS,
  };
}

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
  const label = screenLabelForPath(pathname);
  const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return {
    label,
    screenDoc: doc(db, 'performanceLogs', slug),
    eventsCol: collection(db, 'performanceLogs', slug, 'events'),
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
        ...getSessionData(),
        timestamp:   serverTimestamp(),
      }),
    ]);
  }, `screen_load:${screenPath}`);
}

/**
 * Log the duration of a timed operation (AI generation, data fetch, etc.)
 * tied to the screen that triggered it. Stored as metricType 'ai_call'.
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
        ...getSessionData(),
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
        ...getSessionData(),
        timestamp:     serverTimestamp(),
      }),
    ]);
  }, `error:${screenPath}`);
}
