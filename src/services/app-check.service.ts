/**
 * app-check.service.ts
 *
 * Attaches Firebase App Check tokens to the JS SDK's requests (Auth, Firestore,
 * Functions, Storage), so the backend can tell this app apart from a script
 * calling the same project with the public config.
 *
 * Two SDKs are involved, which is the non-obvious part. The tokens come from the
 * NATIVE side (`@react-native-firebase/app-check`): DeviceCheck on iOS, Play
 * Integrity on Android, the debug provider in dev builds. But every request this
 * app makes goes through the JS SDK, which knows nothing about RNFB — so the JS
 * SDK gets its own App Check instance whose CustomProvider asks the native one
 * for a token.
 *
 * Nothing enforces these tokens yet. Enforcement (Firebase console per service,
 * `enforceAppCheck` on callables) is a later step, and only once most users are
 * on a build that sends them; enforcing earlier locks out every older build.
 * Until then a failure here only means requests go out without a valid token,
 * which unenforced services accept.
 *
 * iOS uses DeviceCheck rather than App Attest because App Attest needs an
 * entitlement and capability change this build doesn't carry. Moving to
 * `appAttestWithDeviceCheckFallback` is a provider string plus that entitlement.
 */

import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';

import { logger } from '@/src/utils/logger';

/** How long to trust a token whose expiry can't be read. Short, so it is re-fetched. */
const FALLBACK_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Milliseconds-since-epoch at which an App Check JWT expires, read from its
 * `exp` claim. The JS SDK schedules refreshes off this, and RNFB returns only
 * the token string. Falls back to a short TTL rather than throwing: a wrong
 * guess only means an early refresh.
 */
export function tokenExpiryMillis(token: string, now: number = Date.now()): number {
  try {
    const payload = token.split('.')[1] ?? '';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const { exp } = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof exp === 'number' && exp * 1000 > now) return exp * 1000;
  } catch {
    // Not a JWT we can read — use the fallback below.
  }
  return now + FALLBACK_TOKEN_TTL_MS;
}

type AppCheckProviderClass =
  new () => import('@react-native-firebase/app-check').ReactNativeFirebaseAppCheckProvider;

interface AppCheckOptions {
  /**
   * A debug token registered in the Firebase console, for dev builds. Without
   * one, the native debug provider generates a token and logs it to the device
   * console, to be registered there once.
   */
  debugToken?: string;
}

let started = false;

/**
 * Starts App Check for the JS SDK app. Call once, right after `initializeApp`
 * and before the first request. Safe to call again (Fast Refresh): later calls
 * do nothing, since App Check can only be initialised once per app.
 */
export function startAppCheck(app: FirebaseApp, { debugToken }: AppCheckOptions = {}): void {
  if (started) return;
  started = true;

  // Required lazily, as in runtime-info.ts: these are native modules, so the
  // import throws anywhere they aren't linked — Jest, or an OTA bundle running
  // on a dev client built before App Check was added. That must degrade to "no
  // tokens", never to a crash at startup.
  let native: typeof import('@react-native-firebase/app-check');
  let nativeApp: ReturnType<typeof import('@react-native-firebase/app').getApp>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require('@react-native-firebase/app-check');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeApp = require('@react-native-firebase/app').getApp();
  } catch (err) {
    logger.error('[app-check] native module unavailable', err, 'app_check_unavailable');
    return;
  }

  // The class is exported at runtime (modular.js), but the package's index.d.ts
  // re-exports a *type* of the same name, which hides the value from TypeScript.
  const Provider = (native as unknown as { ReactNativeFirebaseAppCheckProvider: AppCheckProviderClass })
    .ReactNativeFirebaseAppCheckProvider;
  const provider = new Provider();
  provider.configure({
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity', debugToken },
    apple: { provider: __DEV__ ? 'debug' : 'deviceCheck', debugToken },
  });

  const nativeAppCheck = native.initializeAppCheck(nativeApp, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  nativeAppCheck.catch(logger.catchAsync('app_check_init'));

  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => {
        const { token } = await native.getToken(await nativeAppCheck);
        return { token, expireTimeMillis: tokenExpiryMillis(token) };
      },
    }),
    isTokenAutoRefreshEnabled: true,
  });
}
