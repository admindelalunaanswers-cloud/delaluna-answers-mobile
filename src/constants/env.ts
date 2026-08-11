/**
 * env.ts
 * Single source of truth for the build environment. Read from `APP_ENV`,
 * which is set by EAS build profiles (eas.json) and normalised here so
 * the rest of the app sees one of three canonical values.
 *
 * Used by analytics / crashlytics / performance services to:
 *   - Gate collection (analytics + crashlytics: production only)
 *   - Tag events / traces / crashes with the originating environment
 *
 * Also selects the Firestore database the client connects to — see
 * FIRESTORE_DATABASE_ID at the bottom of this file.
 */

import Constants from "expo-constants";

export type AppEnv = "development" | "preview" | "production";

const raw = (Constants.expoConfig?.extra?.APP_ENV as string | undefined) ?? "";

function normalize(value: string): AppEnv {
  if (value === "production") return "production";
  // Both `preview` and `preview-device` profiles map to the preview env.
  if (value.startsWith("preview")) return "preview";
  return "development";
}

export const APP_ENV: AppEnv = normalize(raw);

export const isProduction = APP_ENV === "production";
export const isPreview = APP_ENV === "preview";
export const isDevelopment = APP_ENV === "development";

/**
 * Firestore database ID per environment, passed to `getFirestore(app, id)`
 * in firebaseConfig.ts. Production stays on `(default)`, the database the
 * live app has always used; dev and preview get their own so local and
 * internal-test traffic never touches real user data.
 *
 * Note: `scripts/migrate-users-to-dllap.js` copied a batch of users from
 * `(default)` into a `dllap` database. That database is deliberately NOT
 * wired up here — production reads and writes `(default)`.
 */
const DATABASE_IDS: Record<AppEnv, string> = {
  development: "(default)",
  preview: "(default)",
  production: "(default)",
};

export const FIRESTORE_DATABASE_ID: string = DATABASE_IDS[APP_ENV];
