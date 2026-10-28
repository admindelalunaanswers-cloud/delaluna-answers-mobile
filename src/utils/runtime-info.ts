/**
 * runtime-info.ts
 * Answers one question, in any build, from the device: **what is this app
 * actually talking to?**
 *
 * There is a single Firebase project (`delaluna-answers`) and every
 * environment uses its `(default)` database, so nothing here is meant to
 * vary — which is exactly why it's worth printing. When development,
 * preview and production all look identical on paper, a build that
 * misbehaves in only one of them is being fed something that isn't on
 * paper, and the candidates are:
 *
 *   - **`extra.FIREBASE_*` came from the wrong source.** These are baked in
 *     at build time from `.env` locally, or from the matching *EAS
 *     environment* for a cloud build. `env.{dev,test,prod}.local` are only
 *     snapshots of those EAS environments — editing one changes nothing
 *     about the next EAS build. A stale value stored in EAS (e.g. still
 *     pointing at the deleted dev project) ships without a local trace.
 *   - **The JS SDK and the native SDK disagree.** Firestore/Auth/Functions
 *     read `extra.FIREBASE_*`; Analytics, Crashlytics, Perf and FCM read
 *     `google-services.json` / `GoogleService-Info.plist`. Nothing forces
 *     the two to match, so `jsProjectId` and `nativeProjectId` are printed
 *     separately and a mismatch is called out.
 *   - **`APP_ENV` never arrived.** `src/constants/env.ts` normalises an
 *     unset value to `development`, silently. `appEnvRaw` is the unnormalised
 *     string — `(unset)` there means the build profile didn't pass it, and
 *     the app is running as development regardless of what it was built as.
 *   - **An OTA update replaced the JS.** `channel` / `updateId` identify the
 *     bundle that's actually executing, which may be newer than the binary.
 *
 * Printed via `logger.info`, so it survives into release builds. Every field
 * is already public in the shipped binary — no secrets, no user data. See
 * the `info` docs in src/utils/logger.ts before adding a field.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { app, USE_EMULATOR } from '@/firebaseConfig';
import { APP_ENV, FIRESTORE_DATABASE_ID } from '@/src/constants/env';
import { logger } from '@/src/utils/logger';

const extra =
  (Constants.expoConfig as any)?.extra ?? (Constants.manifest as any)?.extra ?? {};

export interface RuntimeInfo {
  /** Normalised environment the app believes it's running as. */
  appEnv: string;
  /** The unnormalised `APP_ENV` string, or `(unset)`. A mismatch with
   *  `appEnv` is benign (`preview-device` → `preview`); `(unset)` is not. */
  appEnvRaw: string;
  /** Debug binary? `false` means logger.debug/warn are compiled out. */
  isDevBuild: boolean;
  platform: string;

  /** What Firestore / Auth / Functions / Storage use (from `extra`). */
  jsProjectId: string;
  jsAuthDomain: string;
  jsStorageBucket: string;
  jsAppId: string;
  /** What Analytics / Crashlytics / Perf / FCM use (from the native
   *  google-services files). `(unavailable)` if the native module didn't load. */
  nativeProjectId: string;
  nativeAppId: string;
  /** True when the two config sources name different projects — always a bug. */
  projectMismatch: boolean;

  /** The `getFirestore(app, id)` argument. */
  databaseId: string;
  /** Emulator target, or `off` when talking to the live backend. */
  emulator: string;

  /** OTA identity of the JS bundle currently executing. */
  updateChannel: string;
  runtimeVersion: string;
  updateId: string;
  /** True when running the JS embedded in the binary rather than an OTA update. */
  isEmbeddedLaunch: boolean;
}

/**
 * Native Firebase options, read from `google-services.json` /
 * `GoogleService-Info.plist` at build time.
 *
 * Required lazily and defensively: `@react-native-firebase/app` is a native
 * module, so the import throws anywhere it isn't linked (Jest's node
 * environment, Expo Go). A diagnostic must never be the thing that crashes
 * startup, so a failure here degrades to `(unavailable)`.
 */
function nativeOptions(): { projectId?: string; appId?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApp } = require('@react-native-firebase/app');
    return getApp()?.options ?? {};
  } catch {
    return {};
  }
}

/** Expo Updates identity. Null/throwing in dev and in Expo Go. */
function updateInfo(): {
  channel?: string;
  runtimeVersion?: string;
  updateId?: string;
  isEmbeddedLaunch?: boolean;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates');
    return {
      channel: Updates.channel,
      runtimeVersion: Updates.runtimeVersion,
      updateId: Updates.updateId,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    };
  } catch {
    return {};
  }
}

export function getRuntimeInfo(): RuntimeInfo {
  const native = nativeOptions();
  const updates = updateInfo();

  // `app.options` rather than `extra.FIREBASE_PROJECT_ID`: this is the value
  // the SDK was actually initialised with. Under Fast Refresh the already
  // initialised app is preserved, so after editing .env these can differ
  // until a full reload — the live value is the honest one.
  const jsProjectId = app.options.projectId ?? '(unset)';
  const nativeProjectId = native.projectId ?? '(unavailable)';

  return {
    appEnv: APP_ENV,
    appEnvRaw: (extra.APP_ENV as string | undefined) || '(unset)',
    isDevBuild: typeof __DEV__ !== 'undefined' && __DEV__,
    platform: `${Platform.OS} ${String(Platform.Version)}`,

    jsProjectId,
    jsAuthDomain: app.options.authDomain ?? '(unset)',
    jsStorageBucket: app.options.storageBucket ?? '(unset)',
    jsAppId: app.options.appId ?? '(unset)',
    nativeProjectId,
    nativeAppId: native.appId ?? '(unavailable)',
    projectMismatch:
      native.projectId !== undefined && native.projectId !== jsProjectId,

    databaseId: FIRESTORE_DATABASE_ID,
    emulator: USE_EMULATOR
      ? `ON → ${
          Platform.OS === 'android'
            ? extra.EMULATOR_HOST_ANDROID || 'localhost'
            : extra.EMULATOR_HOST_IOS || 'localhost'
        } (auth 9099 / firestore 8080 / functions 5001 / storage 9199)`
      : 'off — LIVE backend',

    updateChannel: updates.channel || '(none — local or embedded build)',
    runtimeVersion: updates.runtimeVersion || '(unknown)',
    updateId: updates.updateId || '(embedded)',
    isEmbeddedLaunch: updates.isEmbeddedLaunch ?? true,
  };
}

/**
 * Print the banner. Call once at startup, before anything reads Firestore.
 *
 * Grep for it on a device with:
 *   iOS      Console.app, filter the process, search `[runtime]`
 *   Android  `adb logcat | grep '\[runtime\]'`
 */
export function logRuntimeBanner(): void {
  const i = getRuntimeInfo();

  logger.info('[runtime] ───────── Delaluna build identity ─────────');
  logger.info(
    `[runtime] env=${i.appEnv} (APP_ENV raw: ${i.appEnvRaw})  __DEV__=${i.isDevBuild}  ${i.platform}`,
  );
  logger.info(`[runtime] firebase project (js SDK): ${i.jsProjectId}`);
  logger.info(`[runtime] firebase project (native): ${i.nativeProjectId}`);
  logger.info(`[runtime] firestore database:        ${i.databaseId}`);
  logger.info(`[runtime] auth domain:               ${i.jsAuthDomain}`);
  logger.info(`[runtime] storage bucket:            ${i.jsStorageBucket}`);
  logger.info(`[runtime] app id  js=${i.jsAppId}  native=${i.nativeAppId}`);
  logger.info(`[runtime] emulator: ${i.emulator}`);
  logger.info(
    `[runtime] update channel=${i.updateChannel} runtimeVersion=${i.runtimeVersion} updateId=${i.updateId} embedded=${i.isEmbeddedLaunch}`,
  );

  if (i.projectMismatch) {
    // Firestore would be writing to one project while Crashlytics and FCM
    // report from another — worth shouting about rather than burying.
    logger.info(
      `[runtime] ⚠️  PROJECT MISMATCH — js SDK "${i.jsProjectId}" vs native "${i.nativeProjectId}". ` +
        'Firestore/Auth and Analytics/Crashlytics/FCM are on different projects. ' +
        'Reconcile extra.FIREBASE_PROJECT_ID (from .env / the EAS environment) with google-services.json and GoogleService-Info.plist.',
    );
  }
  if (i.appEnvRaw === '(unset)') {
    logger.info(
      '[runtime] ⚠️  APP_ENV was not passed to this build — it is running as "development" ' +
        'regardless of the profile it was built with (analytics/crashlytics collection off).',
    );
  }

  logger.info('[runtime] ──────────────────────────────────────────');
}
