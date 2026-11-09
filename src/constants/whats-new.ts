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

// TODO(release): set `releasedAt` to the 3.0 release day, and replace the draft
// copy below with the final notes.
export const WHATS_NEW: WhatsNewRelease = {
  id: '3.0.0',
  releasedAt: Date.parse('2026-11-08T00:00:00Z'),
  versionLabel: 'Version 3.0',
  title: "What's new in Delaluna",
  subtitle: "Here's what changed since you last visited.",
  items: [
    {
      id: 'free_connection',
      icon: 'people-outline',
      audience: 'free',
      title: 'A connection on the free plan',
      body: 'Add someone special and get a fresh compatibility report every weekday and weekend.',
      cta: { label: 'Try it', route: '/(main)/connections' },
    },
    {
      id: 'twice_weekly_reports',
      icon: 'calendar-outline',
      audience: 'premium',
      title: 'Reports that refresh twice a week',
      body: 'Your connections now get a new weekday report on Sunday and a weekend one on Friday.',
      cta: { label: 'See connections', route: '/(main)/connections' },
    },
    {
      id: 'switch_readers',
      icon: 'swap-horizontal-outline',
      audience: 'all',
      title: 'Switch readers mid-chat',
      body: 'Ask the tarot reader a follow-up to your astrology question without starting over.',
      cta: { label: 'Open chat', route: '/(main)/chat' },
    },
    {
      id: 'accessibility_settings',
      icon: 'text-outline',
      audience: 'all',
      title: 'Text size and motion settings',
      body: 'Make text larger or calm the animations from Profile → Accessibility.',
    },
  ],
};
