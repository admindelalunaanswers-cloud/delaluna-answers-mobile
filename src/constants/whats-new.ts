import type { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { Href } from 'expo-router';

/**
 * The "What's new" sheet shown on the first Home visit after an update.
 *
 * ── Each release ──────────────────────────────────────────────────────────
 * `id` is the app version from app.config.js (`expoConfig.version`), so the
 * sheet re-shows whenever `version` is bumped. Something to announce: replace
 * `items`, bump `version` in app.config.js, and set `releasedAt` to the day the
 * release reaches users ('YYYY-MM-DD', no time).
 *
 * Bumping `version` with nothing new here re-shows the previous release's copy
 * to everyone — update `items` in the same change. Fixing a typo: edit the copy
 * and leave `version` alone.
 *
 * An OTA-only release announces only if it also bumps `version`; an update's
 * manifest carries the config it was published with.
 *
 * `releasedAt` keeps the sheet from new accounts: someone who signed up on or
 * after it never knew the app without these changes. See whats-new-policy.ts.
 */

export type WhatsNewAudience = 'all' | 'free' | 'premium';

export interface WhatsNewItem {
  /** Stable, snake_case — sent to analytics as `item_id`. */
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** Who sees it. Premium means `hasFullAccess` (paying, or admin). */
  audience: WhatsNewAudience;
  /** Optional link to the feature. Closes the sheet, then navigates. */
  cta?: { label: string; route: Href };
}

export interface WhatsNewRelease {
  id: string;
  /** Epoch ms. Accounts created on or after this don't get the sheet. */
  releasedAt: number;
  /** The small pill above the title. */
  versionLabel: string;
  title: string;
  subtitle: string;
  items: readonly WhatsNewItem[];
}

// Release 4.0.0 — a store build (it adds expo-media-library, so it can't ship
// as an OTA to 3.0 binaries; runtimeVersion moves to 4.0.0 with it). Covers
// everything user-visible since 3.0.0.
//
// Also shipping, deliberately without an item:
// - The Constellation Tour. It is offered only to accounts created on or after
//   TOUR_RELEASED_AT, which this sheet stamps silently, so nobody who sees this
//   sheet is ever offered the tour. Announcing it would point existing users at
//   Profile → Walkthrough for a tour written for new ones.
// - Instant chat send (the question shows before the server answers), and no
//   chat-reply push while the chat is on screen. Felt, not features.
// - "Your Birth Chart is Ready" reaching signups who verify later. New
//   accounts only, and the sheet skips those.
// - Interaction analytics, paywall fixes and this sheet itself.
//
// Each plan sees at most four items, which is why the Privacy Policy note
// rides on the chat one.
const APP_VERSION = Constants?.expoConfig?.version ?? '0.0.0';

/** "3.0.1" → "Version 3.0": the pill names the release, not the patch. */
export function versionLabelFor(version: string): string {
  const [major = '0', minor = '0'] = version.split('.');
  return `Version ${major}.${minor}`;
}

/**
 * '2026-11-11' → the start of that day on the device's clock, in epoch ms.
 * Date-only on purpose: a release lands on a day, not at a time. A malformed
 * date throws at startup rather than silently hiding the sheet from everyone.
 */
export function releaseDate(ymd: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`whats-new: releasedAt must be YYYY-MM-DD, got "${ymd}"`);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
}

export const WHATS_NEW: WhatsNewRelease = {
  id: APP_VERSION,
  // The day 4.0.0 reaches users. Accounts created on or after it skip the sheet.
  releasedAt: releaseDate('2026-11-11'),
  versionLabel: versionLabelFor(APP_VERSION),
  title: "What's new in Delaluna",
  subtitle: "Here's what changed since you last visited.",
  items: [
    {
      id: 'free_connection',
      icon: 'people-outline',
      audience: 'free',
      title: 'A connection on the free plan',
      body: 'Save someone special and see how your charts match, no upgrade needed.',
      cta: { label: 'Add a connection', route: '/(main)/connections' },
    },
    {
      id: 'twice_weekly_reports',
      icon: 'calendar-outline',
      audience: 'all',
      title: 'Connection reports, twice a week',
      body: 'A fresh report every Sunday for the week ahead, and every Friday for the weekend. We’ll let you know when it’s ready.',
      cta: { label: 'See connections', route: '/(main)/connections' },
    },
    {
      id: 'chats_kept_60_days',
      icon: 'chatbubbles-outline',
      audience: 'all',
      title: 'Your chats stay for 60 days',
      body: 'Chats no longer clear overnight. They move to your chat history and stay for 60 days after your last question. Our updated Privacy Policy explains this. Read it any time in Profile.',
      cta: { label: 'Open chat', route: '/(main)/chat' },
    },
    {
      id: 'save_chat_to_photos',
      icon: 'image-outline',
      audience: 'all',
      title: 'Save a chat to Photos',
      body: 'Export a reading as an image and save it straight to your Photos, or share it.',
      cta: { label: 'Open chat', route: '/(main)/chat' },
    },
  ],
};
