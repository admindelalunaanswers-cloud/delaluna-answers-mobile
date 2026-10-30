/**
 * When the "share & tag us" prompt may follow a screenshot. Pure, so the rules
 * are tested without a device; src/components/screenshot-share-prompt.tsx owns
 * the listener and the AsyncStorage round trip.
 *
 * The prompt is an invitation, so it backs off hard: at most once a week, never
 * again after three dismissals or "Don't ask again", and never on screens where
 * a screenshot is more likely a support question than something to share.
 */

export const SHARE_PROMPT_STORAGE_KEY = 'sharePrompt:v1';

export const SHARE_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const SHARE_PROMPT_MAX_DISMISSALS = 3;

export interface SharePromptState {
  /** Epoch ms the prompt last opened, or null if it never has. */
  lastShownAt: number | null;
  /** "Not now" taps since the user last shared. */
  dismissals: number;
  optedOut: boolean;
}

export const DEFAULT_SHARE_PROMPT_STATE: SharePromptState = {
  lastShownAt: null,
  dismissals: 0,
  optedOut: false,
};

/**
 * Routes, as expo-router segments, where a screenshot never prompts: sign-in
 * and onboarding, purchase and account screens, birth-data forms, admin, and
 * the help screens.
 */
const BLOCKED_GROUPS = new Set(['(auth)', '(startup)']);
const BLOCKED_ROUTES = new Set([
  '(settings)/paywall',
  '(settings)/edit-profile',
  '(settings)/update-password',
  '(settings)/admin',
  '(util)/loading-screen',
  '(util)/feedback',
  '(util)/support',
  'connection/new',
  'connection/[id]/edit',
]);

export function isBlockedRoute(segments: readonly string[]): boolean {
  if (segments.length > 0 && BLOCKED_GROUPS.has(segments[0])) return true;
  return BLOCKED_ROUTES.has(segments.join('/'));
}

/** Anything unreadable falls back to the defaults rather than throwing. */
export function parseSharePromptState(raw: string | null): SharePromptState {
  if (!raw) return DEFAULT_SHARE_PROMPT_STATE;
  try {
    const v = JSON.parse(raw);
    return {
      lastShownAt: typeof v?.lastShownAt === 'number' ? v.lastShownAt : null,
      dismissals:
        Number.isInteger(v?.dismissals) && v.dismissals >= 0 ? v.dismissals : 0,
      optedOut: v?.optedOut === true,
    };
  } catch {
    return DEFAULT_SHARE_PROMPT_STATE;
  }
}

export function shouldShowSharePrompt(
  state: SharePromptState,
  segments: readonly string[],
  now: number,
): boolean {
  if (state.optedOut) return false;
  if (state.dismissals >= SHARE_PROMPT_MAX_DISMISSALS) return false;
  if (isBlockedRoute(segments)) return false;
  if (state.lastShownAt !== null && now - state.lastShownAt < SHARE_PROMPT_COOLDOWN_MS) {
    return false;
  }
  return true;
}

export function recordShown(state: SharePromptState, now: number): SharePromptState {
  return { ...state, lastShownAt: now };
}

export function recordDismissed(state: SharePromptState): SharePromptState {
  return { ...state, dismissals: state.dismissals + 1 };
}

/** Sharing is the opposite of a dismissal, so it clears the count. */
export function recordShared(state: SharePromptState): SharePromptState {
  return { ...state, dismissals: 0 };
}

export function recordOptedOut(state: SharePromptState): SharePromptState {
  return { ...state, optedOut: true };
}
