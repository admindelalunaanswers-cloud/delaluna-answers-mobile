import type { Href } from 'expo-router';

/**
 * The first-run "Constellation Tour": a spotlight walk across the real screens,
 * one star of the progress constellation per step. Design:
 * https://claude.ai/artifact/EzUHPGCWWgFaEvTop8JUpq
 *
 * Who is offered it is decided in src/utils/tour-policy.ts; the state lives in
 * src/context/tour-context.tsx and the drawing in src/components/tour/.
 *
 * ── Editing ───────────────────────────────────────────────────────────────
 * Copy can change freely. A step's `target` must match a `useTourTarget` /
 * `<TourTarget>` id mounted on its `route`; a target that never mounts is not
 * an error, the card just shows without a spotlight. Keep `id` values stable
 * and snake_case: they go to analytics as `step_id`.
 */

/** Stored on this device once the tour is finished, skipped or declined. */
export const TOUR_ID = 'constellation_v1';

/**
 * Epoch ms. Accounts created before this never get the offer (they already
 * know the app; Profile → Replay app tour is there for them).
 */
export const TOUR_RELEASED_AT = Date.UTC(2026, 10, 8);

/** Ids of the elements the tour can spotlight. */
export const TOUR_TARGETS = {
  homeSigns: 'home-signs',
  homeDateSwitcher: 'home-date-switcher',
  homeCards: 'home-cards',
  tabConnections: 'tab-connections',
  tabTransits: 'tab-transits',
  chatModeToggle: 'chat-mode-toggle',
  homeProfile: 'home-profile',
} as const;

export type TourTargetId = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

export interface TourChip {
  label: string;
  premium?: boolean;
}

export interface TourStep {
  /** Stable, snake_case — analytics `step_id`. */
  id: string;
  target: TourTargetId;
  /** The tab the target lives on, as `usePathname()` reports it. */
  route: '/' | '/chat';
  /** `circle` for icons (the tab bar), `rounded` for regions. */
  shape: 'rounded' | 'circle';
  title: string;
  body: string;
  chips?: readonly TourChip[];
  /** Small print under the body. */
  note?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'big_three',
    target: TOUR_TARGETS.homeSigns,
    route: '/',
    shape: 'rounded',
    title: 'Your Big Three',
    body: 'Sun, Moon and Rising, worked out from your exact birth time and place. Tap here any time to open your full birth chart and its breakdown.',
  },
  {
    id: 'date_switcher',
    target: TOUR_TARGETS.homeDateSwitcher,
    route: '/',
    shape: 'rounded',
    title: 'Yesterday, today, tomorrow',
    body: 'A new horoscope every day. Switch days here to look back or read ahead.',
    note: 'Yesterday and tomorrow are part of Premium.',
  },
  {
    id: 'daily_cards',
    target: TOUR_TARGETS.homeCards,
    route: '/',
    shape: 'rounded',
    title: 'Draw your daily cards',
    body: 'Fresh tarot cards every day. Tap to turn them over, then read what they mean for you.',
  },
  {
    id: 'connections',
    target: TOUR_TARGETS.tabConnections,
    route: '/',
    shape: 'circle',
    title: 'See how you connect',
    body: "Add a partner, friend or crush with their birth details. Their compatibility report refreshes for the week, and again for the weekend.",
    chips: [
      { label: 'Compatibility' },
      { label: 'Weekend romance report' },
      { label: 'Synastry', premium: true },
    ],
  },
  {
    id: 'transits',
    target: TOUR_TARGETS.tabTransits,
    route: '/',
    shape: 'circle',
    title: "This week's planets",
    body: 'See where the planets are moving through your chart this week, house by house, and what it means for you.',
  },
  {
    id: 'chat',
    target: TOUR_TARGETS.chatModeToggle,
    route: '/chat',
    shape: 'rounded',
    title: 'Two readers, one conversation',
    body: 'Ask the Astrologer about your chart, or switch to Tarot and a spread is drawn for your question. Switch whenever you like, and the conversation carries on.',
    note: 'You get a few free questions every day. Premium gives you more.',
  },
  {
    id: 'profile',
    target: TOUR_TARGETS.homeProfile,
    route: '/',
    shape: 'circle',
    title: 'Make it yours',
    body: 'Your profile holds themes, text size and other accessibility settings, notifications, and this tour if you want to see it again.',
  },
];

/** Where the finish screen's shortcuts lead. `home` just closes the tour. */
export type TourFinishCta = 'chat' | 'connection' | 'birth_chart' | 'home';

export const TOUR_FINISH_LINKS: readonly { cta: Exclude<TourFinishCta, 'home'>; label: string; route: Href }[] = [
  { cta: 'chat', label: 'Ask your first question', route: '/chat' },
  { cta: 'connection', label: 'Add your first connection', route: '/connection/new' },
  { cta: 'birth_chart', label: 'Open my birth chart', route: '/(home)/birth-chart-view' },
];
