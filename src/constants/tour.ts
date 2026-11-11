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
 * and snake_case. The tour reports nothing to analytics — see tour-context.
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
  homeNatalChart: 'home-natal-chart',
  homeDateSwitcher: 'home-date-switcher',
  homeCards: 'home-cards',
  homeMessageBottle: 'home-message-bottle',
  tabConnections: 'tab-connections',
  tabTransits: 'tab-transits',
  chatModeAstrology: 'chat-mode-astrology',
  chatModeTarot: 'chat-mode-tarot',
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
  /** The screen the step opens, as `usePathname()` reports it. */
  route: '/' | '/connections' | '/transits' | '/chat';
  /** `circle` for icons (the avatar), `rounded` for regions and tab buttons. */
  shape: 'rounded' | 'circle';
  /**
   * Space between the target and the ring, in points. Defaults to 6 for a
   * circle and 8 for a region. Tab targets are the whole tab button, so they
   * take 0 and the ring sits on the square's edge.
   */
  padding?: number;
  title: string;
  body: string;
  chips?: readonly TourChip[];
  /** When the section refreshes, shown with a clock under the body. Device-local times. */
  schedule?: string;
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
    body: 'Sun, Moon and Rising, worked out from your exact birth time and place. Together they sketch who you are, how you feel and how others see you.',
  },
  {
    id: 'natal_chart',
    target: TOUR_TARGETS.homeNatalChart,
    route: '/',
    shape: 'rounded',
    title: 'Your natal chart',
    body: 'Every planet and house at the moment you were born, with a breakdown of what each placement means for you. Tap Natal Chart to open it.',
    note: "If it says Natal Chart Loading, your breakdown is still being written. We'll send you a notification when it's ready.",
  },
  {
    id: 'date_switcher',
    target: TOUR_TARGETS.homeDateSwitcher,
    route: '/',
    shape: 'rounded',
    title: 'Your daily horoscope',
    body: "A new reading every day, right here on Home: a quote, advice, your do's and don'ts, and an affirmation. Use the arrows to look back or read ahead.",
    schedule: 'New every day at midnight',
    note: 'Yesterday and tomorrow are part of Premium.',
  },
  {
    id: 'daily_cards',
    target: TOUR_TARGETS.homeCards,
    route: '/',
    shape: 'rounded',
    title: 'Draw your daily cards',
    body: 'Fresh tarot cards every day. Tap to turn them over, then read what they mean for you.',
    schedule: 'New cards every day at midnight',
  },
  {
    id: 'message_bottle',
    target: TOUR_TARGETS.homeMessageBottle,
    route: '/',
    shape: 'rounded',
    title: 'Message in a Bottle',
    body: "Something you need to let go of? Write it here and send it out to the universe.",
    note: "It isn't saved or shared anywhere. It's just for you.",
  },
  {
    id: 'connections',
    target: TOUR_TARGETS.tabConnections,
    route: '/connections',
    shape: 'rounded',
    padding: 0,
    title: 'See how you connect',
    body: 'Add a partner, friend or crush with their birth details to see your compatibility, for the week ahead and for the weekend.',
    schedule: 'Weekday report every Sunday · Weekend report every Friday',
    chips: [
      { label: 'Weekday connection report' },
      { label: 'Weekend romance report' },
      { label: 'Synastry', premium: true },
    ],
  },
  {
    id: 'transits',
    target: TOUR_TARGETS.tabTransits,
    route: '/transits',
    shape: 'rounded',
    padding: 0,
    title: "This week's planets",
    body: 'See where the planets are moving through your chart this week, house by house, and what it means for you.',
    schedule: 'New every Sunday',
  },
  // Two chat steps, one per half of the reader toggle. The tour only spotlights
  // them; it never switches reader, since a switch spends the thread's budget.
  {
    id: 'chat_astrology',
    target: TOUR_TARGETS.chatModeAstrology,
    route: '/chat',
    shape: 'rounded',
    title: 'Ask the Astrologer',
    body: 'Questions about your chart, your day or your relationships, answered from your own birth chart.',
    note: "Not sure what to ask? Tap a suggested question. Tap Add a Connection to ask about someone you've saved.",
  },
  {
    id: 'chat_tarot',
    target: TOUR_TARGETS.chatModeTarot,
    route: '/chat',
    shape: 'rounded',
    title: 'Or ask the Tarot reader',
    body: 'Switch to Tarot and a spread is drawn for each question you ask. Switch readers whenever you like, and the conversation carries on.',
    schedule: 'Free questions reset every day at midnight',
    note: 'Premium gives you more questions each day.',
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
  { cta: 'birth_chart', label: 'Open my natal chart', route: '/(home)/birth-chart-view' },
];
