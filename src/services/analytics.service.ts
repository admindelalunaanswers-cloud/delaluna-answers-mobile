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

// While the first-run tour is on screen nothing is reported: the tour moves
// between tabs by itself, and those screen views and events aren't the user's.
// Set by src/context/tour-context.tsx only.
let suppressed = false;

export function setAnalyticsSuppressed(on: boolean): void {
  suppressed = on;
}

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

// Maps Expo Router route templates to human-friendly screen names that show up
// in GA4's "Pages and screens" report. Keys are `routeKeyForSegments()` output
// — group segments kept, dynamic segments as their template (`[id]`) — so a
// screen reached at /connection/abc123 is one row, not one per connection.
// `usePathname()` is no use as a key: it drops the groups (so `/(main)/chat`
// never matched) and carries the concrete id. Anything not listed falls back
// to the prettified key.
//
// "/(main)/index" is a perf-log key (useScreenPerfLog), not a router key — the
// router reports that screen as "/(main)". Its label is the slug its
// performanceLogs history is stored under, so don't rename it casually.
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
  "/connection/[id]": "Connection Report",
  "/connection/[id]/edit": "Edit Connection",
  "/connection/[id]/synastry": "Synastry",
  "/(auth)/login": "Login",
  "/(auth)/sign-up": "Sign Up",
  "/(auth)/verify-email": "Verify Email",
  "/(auth)/forgot-password": "Forgot Password",
  "/(startup)/welcome": "Welcome",
  "/(settings)/profile": "Profile",
  "/(settings)/edit-profile": "Edit Profile",
  "/(settings)/paywall": "Paywall",
  "/(settings)/accessibility": "Accessibility",
  "/(settings)/purchased-reports": "Purchased Reports",
  "/(settings)/select-avatar": "Select Avatar",
  "/(settings)/update-password": "Update Password",
  "/(settings)/update-theme.screen": "Update Theme",
  "/(settings)/admin": "Admin",
  "/(util)/loading-screen": "Loading",
  "/(util)/feedback": "Feedback",
  "/(util)/support": "Support",
};

/**
 * The route template for `useSegments()` output: `['connection', '[id]']` →
 * `/connection/[id]`, `['(main)']` → `/(main)`. Never contains a concrete id.
 */
export function routeKeyForSegments(segments: readonly string[]): string {
  return "/" + segments.join("/");
}

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
  if (suppressed) return Promise.resolve();
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
  if (suppressed) return Promise.resolve();
  return safe(
    () => fbLogEvent(getAnalytics(), name, params as any),
    `event:${name}`,
  );
}

// ─── In-screen interactions ─────────────────────────────────────────────────
// One event, `ui_interaction`, for everything a user does *inside* a screen,
// so "what gets used most" is a single GA4 report broken down by
// screen → feature → item. Register `screen`, `feature`, `action` and `item`
// as event-scoped custom dimensions in the Firebase console, or GA4 collects
// them without showing them anywhere.
//
// Every value must come from a fixed set the code chooses: a tab name, a house
// number, a section id. Never a name, birth detail, connection id or anything
// the user typed — GA4 keeps it, and it is joined to the user_id.

export type InteractionScreen =
  | "home"
  | "birth_chart"
  | "transits"
  | "chat"
  | "connections"
  | "connection_report"
  | "connection_new"
  | "connection_edit"
  | "synastry";

export type InteractionAction =
  | "tap" // a button or link
  | "select" // a tab, date or option
  | "expand"
  | "collapse"
  | "reveal" // a card turned over
  | "unlock" // a locked item tapped — the paywall follows
  | "view"; // a section scrolled into view (read depth), not a tap

export interface Interaction {
  screen: InteractionScreen;
  /** The control: `date_switcher`, `breakdown_tab`, `house_card`… */
  feature: string;
  action: InteractionAction;
  /** Which one: `today`, `aspects`, `house_7`… Optional. */
  item?: string | number;
}

/** snake_case, ≤ 100 chars (GA4's string-value cap). `Natal Wheel` → `natal_wheel`. */
export function toAnalyticsValue(value: string | number): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

export function trackInteraction({
  screen,
  feature,
  action,
  item,
}: Interaction): Promise<void | void> {
  return logEvent("ui_interaction", {
    screen,
    feature: toAnalyticsValue(feature),
    action,
    ...(item !== undefined && item !== "" ? { item: toAnalyticsValue(item) } : {}),
  });
}

/** The day a date id is relative to today: what the date switchers report. */
export function relativeDay(
  dateId: string,
  todayId: string,
): "yesterday" | "today" | "tomorrow" | "other" {
  if (dateId === todayId) return "today";
  const day = 24 * 60 * 60 * 1000;
  const diff = Math.round(
    (Date.parse(`${dateId}T00:00:00Z`) - Date.parse(`${todayId}T00:00:00Z`)) / day,
  );
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  return "other";
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
  // "Viewed" = the content was on screen, not just the route opened — the
  // gap between these and screen_view is how often a screen showed a skeleton
  // or a paygate instead.
  transitsViewed: () => logEvent("transits_viewed"),
  horoscopeViewed: (params: { day: "yesterday" | "today" | "tomorrow" | "other" }) =>
    logEvent("horoscope_viewed", params),
  natalBreakdownViewed: (params: { premium: boolean }) =>
    logEvent("natal_breakdown_viewed", params),
  tarotDrawn: (params: { source: "home" | "chat"; cards: number }) =>
    logEvent("tarot_drawn", params),

  // Connections / synastry
  connectionCreated: (params?: {
    first_person: "me" | "someone_else";
    /** The relationship option chosen — a fixed list in the form. */
    relationship: string;
  }) => logEvent("connection_created", params),
  /** What the saved edit changed. `birth_details` regenerates the report. */
  connectionUpdated: (params: { change: "pronouns_only" | "birth_details" | "details" }) =>
    logEvent("connection_updated", params),
  /** `count`: connections saved, from the list's first server snapshot. */
  connectionsListViewed: (params: { count: number }) =>
    logEvent("connections_list_viewed", params),
  connectionReportViewed: () => logEvent("connection_report_viewed"),
  connectionDeleted: () => logEvent("connection_deleted"),
  /** `saved`: an existing reading, rather than one generated for this visit. */
  synastryViewed: (params: { saved: boolean }) =>
    logEvent("synastry_viewed", params),

  // Chat
  chatMessageSent: (params?: { length?: number; mode?: "astrology" | "tarot" }) =>
    logEvent("chat_message_sent", params),
  chatRetry: () => logEvent("chat_retry"),
  chatExported: (params: {
    format: "text" | "pdf" | "image";
    /** Image only: saved to the photo library, or sent through the share sheet. */
    destination?: "photos" | "share";
    source: "chat" | "history";
    includeQuestions: boolean;
    includeBirthDetails: boolean;
  }) => logEvent("chat_exported", params),

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

  // What's new sheet. `release_id` and `item_id` come from
  // src/constants/whats-new.ts — fixed strings, never user data.
  whatsNewShown: (params: { release_id: string; source: "auto" | "profile" }) =>
    logEvent("whats_new_shown", params),
  whatsNewDismissed: (params: {
    release_id: string;
    reason: "button" | "backdrop" | "back";
  }) => logEvent("whats_new_dismissed", params),
  whatsNewCta: (params: { release_id: string; item_id: string }) =>
    logEvent("whats_new_cta", params),
} as const;
