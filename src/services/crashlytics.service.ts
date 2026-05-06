/**
 * crashlytics.service.ts
 * Thin wrapper around @react-native-firebase/crashlytics using the v22
 * modular API.
 *
 * Crashlytics auto-captures native iOS / Android crashes. This wrapper
 * adds JS-side helpers for non-fatal errors, breadcrumbs, and user
 * context so crashes are attributable.
 *
 * Behavior in __DEV__:
 *   By default the SDK does NOT upload crashes from a debug build (so
 *   developer crashes don't pollute prod data). To force uploads while
 *   testing, set `crashlytics_debug_enabled` to true in `firebase.json`.
 *
 * Reserved:
 *   - `crash()` is intentionally exposed as `forceCrash()` so the call
 *     site is grep-able and obviously test-only.
 */

import {
  crash as fbCrash,
  getCrashlytics,
  log as fbLog,
  recordError as fbRecordError,
  setAttribute as fbSetAttribute,
  setAttributes as fbSetAttributes,
  setCrashlyticsCollectionEnabled as fbSetEnabled,
  setUserId as fbSetUserId,
} from '@react-native-firebase/crashlytics';

function safe(fn: () => unknown, label: string): void {
  try {
    Promise.resolve(fn()).catch((err) => {
      if (__DEV__) console.warn(`[crashlytics] ${label} failed:`, err);
    });
  } catch (err) {
    if (__DEV__) console.warn(`[crashlytics] ${label} failed:`, err);
  }
}

// ─── User context ───────────────────────────────────────────────────────────

export function setUserId(uid: string | null): void {
  // Crashlytics setUserId requires a string; pass empty string to clear.
  safe(() => fbSetUserId(getCrashlytics(), uid ?? ''), 'setUserId');
}

export function setAttribute(name: string, value: string): void {
  safe(() => fbSetAttribute(getCrashlytics(), name, value), `setAttribute:${name}`);
}

export function setAttributes(attrs: Record<string, string>): void {
  safe(() => fbSetAttributes(getCrashlytics(), attrs), 'setAttributes');
}

// ─── Breadcrumbs ────────────────────────────────────────────────────────────

/**
 * Add a breadcrumb that will be attached to the next crash report.
 * Useful for narrating the user's journey leading up to a crash —
 * "tapped paywall", "started chat send", etc.
 */
export function logBreadcrumb(message: string): void {
  safe(() => fbLog(getCrashlytics(), message), 'log');
}

// ─── Non-fatal errors ───────────────────────────────────────────────────────

/**
 * Record a handled error as non-fatal. Use this in catch blocks where
 * you've already recovered but want visibility in the dashboard.
 *
 *   try { ... } catch (e) {
 *     recordError(e, 'chat_send');
 *   }
 */
export function recordError(error: unknown, jsErrorName?: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  safe(() => fbRecordError(getCrashlytics(), err, jsErrorName), 'recordError');
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Toggle Crashlytics collection at runtime (privacy opt-out).
 * Persists across launches.
 */
export function setCrashlyticsEnabled(enabled: boolean): void {
  safe(() => fbSetEnabled(getCrashlytics(), enabled), 'setCrashlyticsEnabled');
}

// ─── Test only ──────────────────────────────────────────────────────────────

/**
 * Force a native crash. ONLY for verifying Crashlytics setup — never ship
 * a path that calls this. Wire it behind a hidden debug button if needed.
 */
export function forceCrash(): void {
  fbCrash(getCrashlytics());
}

// ─── Global JS error handler ────────────────────────────────────────────────

/**
 * Install a global handler that forwards uncaught JS errors and unhandled
 * Promise rejections to Crashlytics as non-fatals. Call once at app startup
 * (before any other handlers register).
 *
 * Note: native crashes (Swift / Kotlin) are captured automatically by the
 * SDK without this. This only covers the JS layer.
 */
let _installed = false;
export function installGlobalErrorHandler(): void {
  if (_installed) return;
  _installed = true;

  const ErrorUtils = (global as any).ErrorUtils;
  if (ErrorUtils && typeof ErrorUtils.getGlobalHandler === 'function') {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      try {
        recordError(error, isFatal ? 'js_fatal' : 'js_uncaught');
      } catch {}
      if (typeof previous === 'function') previous(error, isFatal);
    });
  }

  // Unhandled promise rejections — RN exposes this via the `HermesInternal`
  // tracking or the legacy `process` polyfill depending on engine. Either
  // way, listen on `global.addEventListener` if available.
  const addEvt = (global as any).addEventListener;
  if (typeof addEvt === 'function') {
    try {
      addEvt('unhandledrejection', (event: any) => {
        const reason = event?.reason ?? event;
        recordError(reason, 'unhandled_promise_rejection');
      });
    } catch {
      // ignore — environment doesn't support DOM events
    }
  }
}
