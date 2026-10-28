/**
 * logger.ts
 * Single entry point for app-side logging.
 *
 * Why this exists rather than raw `console.*`:
 *   - `console.log` / `console.warn` still execute in release builds, and
 *     everything they print lands in `adb logcat` / Console.app. Anything
 *     passed to them is effectively public on the device, so debug chatter
 *     (and the values it carries) must not survive into production.
 *   - Handled errors were being written to `console.error` and nowhere else,
 *     which made them invisible once the app shipped. `logger.error` forwards
 *     to Crashlytics as a non-fatal so they show up in the dashboard.
 *
 * Behaviour by level:
 *   debug — dev only. Pure developer chatter; compiled out of release builds.
 *   info  — every build, including release. Reserved for a handful of startup
 *           facts that must be readable off a shipped device. See below.
 *   warn  — dev only. Recoverable oddities that don't need a dashboard entry.
 *   error — always records to Crashlytics; also prints in dev for immediacy.
 *
 * Never pass PII or credentials to any level. `debug` and `warn` are silent
 * in production but still print on any developer's machine, and the arguments
 * to `error` are shipped to Crashlytics. Log the shape of a thing, not its
 * contents: `logger.debug('[push] token registered')`, never the token.
 */

import { recordError } from '@/src/services/crashlytics.service';

/**
 * `__DEV__` is true under Jest as well as in dev builds, which is what keeps
 * the existing `expect(console.warn).toHaveBeenCalledWith(...)` assertions in
 * src/services/__tests__ working after the migration.
 */
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Developer chatter — lifecycle breadcrumbs, state transitions, "we got here".
 * Stripped from release builds.
 */
function debug(...args: unknown[]): void {
  if (isDev) console.log(...args);
}

/**
 * Prints in **every** build, release included — so everything passed here is
 * readable by anyone with the device via `adb logcat` / Console.app. That is
 * the entire point: it exists so a tester or TestFlight build can be asked
 * "which backend are you actually talking to?" without a debug build.
 *
 * The bar for using it is therefore high. Only build-identity facts that are
 * already public in the shipped binary qualify — the Firebase project id,
 * the Firestore database id, APP_ENV, the update channel. All of those are
 * recoverable from the app manifest or `google-services.json` by anyone who
 * can read the logs anyway, so printing them discloses nothing new.
 *
 * Never a uid, token, email, birth datum, or anything the user typed — for
 * those, `debug` is the level, and it disappears in release.
 *
 * Today the only caller is `logRuntimeBanner()` in src/utils/runtime-info.ts.
 * Keep it that way unless there's a similarly strong reason.
 */
function info(...args: unknown[]): void {
  console.log(...args);
}

/**
 * A recoverable problem worth a developer's attention but not a dashboard
 * entry — a cache miss, a malformed value that was defaulted, a skipped step.
 * Stripped from release builds.
 */
function warn(...args: unknown[]): void {
  if (isDev) console.warn(...args);
}

/**
 * A handled error. Always recorded to Crashlytics as a non-fatal, so it stays
 * visible in production.
 *
 * `tag` becomes the Crashlytics `jsErrorName`, which is what the dashboard
 * groups on — keep it a short, stable, snake_case identifier for the call
 * site (`rc_refresh`, `chat_send`), not a formatted message.
 *
 *   logger.error('[RevenueCat] refresh failed', err, 'rc_refresh');
 */
function error(message: string, err?: unknown, tag?: string): void {
  if (isDev) console.error(message, err ?? '');
  recordError(err ?? new Error(message), tag);
}

/**
 * Rejection handler for fire-and-forget promises, replacing the bare
 * `.catch(console.error)` idiom — which swallowed the failure in production
 * because nothing downstream of `console` exists in a release build.
 *
 *   void requestBreakdown(uid, chart).catch(logger.catchAsync('breakdown'));
 *
 * The tag is required here: a detached promise has no surrounding message to
 * identify it, so without one every rejection lands in the same Crashlytics
 * bucket.
 */
function catchAsync(tag: string): (err: unknown) => void {
  return (err: unknown) => error(`[${tag}] unhandled rejection`, err, tag);
}

export const logger = { debug, info, warn, error, catchAsync };
