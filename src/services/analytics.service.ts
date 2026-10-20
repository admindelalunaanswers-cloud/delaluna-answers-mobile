/**
 * analytics.service.ts
 * Thin wrapper around @react-native-firebase/analytics (GA4) using the
 * v22 modular API (the namespaced `analytics().xxx()` API is deprecated).
 *
 * - All calls are fire-and-forget; failures are logged and swallowed so
 *   analytics can never crash the app.
 * - Auto-collected events (first_open, session_start, screen_view via
 *   logScreenView, etc.) flow to GA4 via the Firebase ↔ GA4 link.
 * - Custom event names: snake_case, <= 40 chars; param keys <= 40 chars,
 *   string values <= 100 chars (GA4 limits).
 */

import {
  logEvent as fbLogEvent,
  setAnalyticsCollectionEnabled as fbSetAnalyticsCollectionEnabled,
  setUserId as fbSetUserId,
  setUserProperties as fbSetUserProperties,
  setUserProperty as fbSetUserProperty,
  getAnalytics,
} from "@react-native-firebase/analytics";

import { APP_ENV, isProduction } from "@/src/constants/env";
import { logger } from "@/src/utils/logger";

// Disable collection outside production. Runs at module load — before any
// event is logged. Note: setAnalyticsCollectionEnabled is persisted across
// launches, so flipping it here ensures dev/preview builds stop reporting
// even if a previous prod install on the same device had it enabled.
//
// We still allow the SDK's API to be called downstream — it just won't
// upload anything. Tagging the environment is harmless either way.
(async () => {
  try {
    await fbSetAnalyticsCollectionEnabled(getAnalytics(), isProduction);
    await fbSetUserProperty(getAnalytics(), "app_environment", APP_ENV);
  } catch (err) {
    logger.warn("[analytics] init failed:", err);
  }
})();

type Params = Record<string, string | number | boolean | null | undefined>;

function safe<T>(fn: () => Promise<T>, label: string): Promise<T | void> {
  return fn().catch((err) => {
    logger.warn(`[analytics] ${label} failed:`, err);
  });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Enable or disable analytics collection at runtime (e.g. for a privacy
 * opt-out toggle). Persists across sessions.
 */
export function setAnalyticsEnabled(enabled: boolean): Promise<void | void> {
  return safe(
    () => fbSetAnalyticsCollectionEnabled(getAnalytics(), enabled),
    "setAnalyticsCollectionEnabled",
  );
}

// ─── User identification ────────────────────────────────────────────────────

export function setUserId(uid: string | null): Promise<void | void> {
  return safe(() => fbSetUserId(getAnalytics(), uid), "setUserId");
}

export function setUserProperty(
  name: string,
  value: string | null,
): Promise<void | void> {
  return safe(
    () => fbSetUserProperty(getAnalytics(), name, value),
    `setUserProperty:${name}`,
  );
}

export function setUserProperties(
  props: Record<string, string | null>,
): Promise<void | void> {
  return safe(
    () => fbSetUserProperties(getAnalytics(), props),
    "setUserProperties",
  );
}

// ─── Screen tracking ────────────────────────────────────────────────────────

// Maps Expo Router pathnames to human-friendly screen names that show up in
// GA4's "Pages and screens" report. Anything not listed falls back to the
// raw path with the leading slash and group-segment parens stripped.
const ROUTE_LABELS: Record<string, string> = {
  "/(main)": "Home",
  "/(main)/home": "Home",
  "/(main)/index": "Birth Data Input",
  "/(main)/connections": "Connections",
  "/(main)/transits": "Transits",
  "/(main)/chat": "Chat",
  "/(testing)/ResultsScreen": "Natal Chart Results",
  "/(home)/birth-chart-view": "Birth Chart",
  "/connection/new": "New Connection",
  "/connection/SynastryScreen": "Synastry",
  "/(auth)/login": "Login",
  "/(auth)/sign-up": "Sign Up",
  "/(auth)/verify-email": "Verify Email",
  "/(auth)/forgot-password": "Forgot Password",
  "/(startup)/welcome": "Welcome",
  "/(settings)/profile": "Profile",
  "/(settings)/edit-profile": "Edit Profile",
  "/(settings)/paywall": "Paywall",
  "/(util)/loading-screen": "Loading",
};

function fallbackLabel(pathname: string): string {
  return (
    pathname
      .replace(/\/\([^)]+\)/g, "") // strip group segments like (main), (auth)
      .replace(/^\/+|\/+$/g, "") // trim leading/trailing slashes
      .replace(/\//g, " / ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Home"
  );
}

export function screenLabelForPath(pathname: string): string {
  // Strip dynamic-segment values: /connection/abc123 → /connection/[id]
  // We don't currently have generic dynamic-route labels, so just look up
  // the literal path; unknowns fall through to the prettifier.
  return ROUTE_LABELS[pathname] ?? fallbackLabel(pathname);
}

// `screen_view` is a reserved GA4 event; logging it via logEvent populates the
// same screen reports as the deprecated logScreenView helper.
export function logScreenView(
  screenName: string,
  screenClass?: string,
): Promise<void | void> {
  return safe(
    () =>
      fbLogEvent(getAnalytics(), "screen_view", {
        screen_name: screenName,
        screen_class: screenClass ?? screenName,
      }),
    `screen_view:${screenName}`,
  );
}

// ─── Generic event ──────────────────────────────────────────────────────────

export function logEvent(name: string, params?: Params): Promise<void | void> {
  return safe(
    () => fbLogEvent(getAnalytics(), name, params as any),
    `event:${name}`,
  );
}

// ─── Domain events ──────────────────────────────────────────────────────────
// Keep names snake_case and stable — renaming breaks historical reports.

export const Events = {
  // Auth
  signUp: (method: "email" | "apple" | "google") =>
    logEvent("sign_up", { method }),
  login: (method: "email" | "apple" | "google") =>
    logEvent("login", { method }),
  emailVerified: () => logEvent("email_verified"),

  // Birth chart / core flows
  birthChartGenerated: (params?: { has_time?: boolean }) =>
    logEvent("birth_chart_generated", params),
  transitsViewed: () => logEvent("transits_viewed"),
  horoscopeViewed: () => logEvent("horoscope_viewed"),
  tarotDrawn: (card?: string) => logEvent("tarot_drawn", { card }),

  // Connections / synastry
  connectionCreated: () => logEvent("connection_created"),
  connectionDeleted: () => logEvent("connection_deleted"),
  synastryViewed: () => logEvent("synastry_viewed"),

  // Chat
  chatMessageSent: (params?: { length?: number }) =>
    logEvent("chat_message_sent", params),
  chatRetry: () => logEvent("chat_retry"),

  // Monetization (paywall + RevenueCat)
  paywallViewed: (source: string) => logEvent("paywall_viewed", { source }),
  paywallDismissed: (source: string) =>
    logEvent("paywall_dismissed", { source }),
  purchaseStarted: (productId: string) =>
    logEvent("purchase_started", { product_id: productId }),
  purchaseCompleted: (params: {
    product_id: string;
    price?: number;
    currency?: string;
  }) => logEvent("purchase_completed", params),
  purchaseFailed: (params: {
    product_id: string;
    reason?: string;
    user_cancelled?: boolean;
  }) => logEvent("purchase_failed", params),
  restorePurchases: (params: { success: boolean }) =>
    logEvent("restore_purchases", params),

  // Settings
  themeChanged: (theme: string) => logEvent("theme_changed", { theme }),
} as const;
