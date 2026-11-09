import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

/**
 * The "What's new" sheet shown on the first Home visit after an update.
 *
 * ── Each release ──────────────────────────────────────────────────────────
 * Something to announce: replace `items`, change `id`, set `releasedAt` to the
 * day the release reaches users. Nothing to announce: leave this file alone —
 * an unchanged `id` means nobody sees the sheet.
 *
 * Fixing a typo after release: edit the copy and KEEP the `id`. Changing it
 * shows the sheet again to everyone who already closed it.
 *
 * `id` is deliberately not `expoConfig.version`: an OTA update doesn't change
 * the binary version, and it should still be able to announce something.
 *
 * `releasedAt` keeps the sheet from new accounts: someone who signed up after
 * it never knew the app without these changes. See whats-new-policy.ts.
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

// Release 4.0.0, from the Notion runbook. It ships as an OTA update to the
// 3.0.0 binaries, so the label and id stay 3.0. If 4.0.0 goes to the stores
// instead (runbook Phase 4B), change both to 4.0.
//
// TODO(release): `releasedAt` is the runbook's planned OTA day (Nov 11). If the
// OTA moves, move this with it — accounts created after it skip the sheet.
//
// Interaction analytics and this sheet ship too, but users wouldn't notice
// either, so neither gets an item.
export const WHATS_NEW: WhatsNewRelease = {
  id: '3.0.0',
  releasedAt: Date.parse('2026-11-11T00:00:00-06:00'),
  versionLabel: 'Version 3.0',
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
      body: 'Chats no longer clear overnight. They move to your chat history and stay for 60 days after your last question.',
      cta: { label: 'Open chat', route: '/(main)/chat' },
    },
    {
      id: 'privacy_policy_update',
      icon: 'shield-checkmark-outline',
      audience: 'all',
      title: 'An updated Privacy Policy',
      body: 'Including how long we keep chats and which services we use. Read it any time in Profile.',
    },
  ],
};
