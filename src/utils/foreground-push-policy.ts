/**
 * Which pushes to hold back while the app is open, and the screen the app is
 * showing that the decision is made against.
 *
 * `notifyChatReply` skips users whose `lastActiveAt` is under 30s old, but that
 * field is only written when the app comes to the foreground — so anyone who
 * has been in the app longer than 30s looks away, and the reply push arrives as
 * a banner over the very chat that is already showing the answer. The server
 * cannot know which screen is up; the device can, so the decision lives here.
 *
 * Not a pure policy like `whats-new-policy.ts`: it holds one piece of
 * module-level state, the current route, which the root layout writes and the
 * notification handler (loaded lazily) reads, without either importing the
 * other. `shouldSuppressForegroundPush` itself is pure when passed a route.
 * It has no dependencies, so either side can import it cheaply.
 */

/**
 * The route key (`routeKeyForSegments`) and push `data.screen` of the chat tab.
 * Duplicated by hand in `notifyChatReply` (functions/src/index.ts), which the
 * tests cannot see — change both together.
 */
export const CHAT_SCREEN = '/(main)/chat';

let currentRoute: string | null = null;

/** Called by the root layout on every route change. */
export function setForegroundRoute(route: string | null): void {
  currentRoute = route;
}

export function getForegroundRoute(): string | null {
  return currentRoute;
}

/**
 * True when a push arriving now should not be shown: a chat reply while the
 * chat screen is in front, where the answer is already landing live. Every
 * other push — and a chat reply on any other screen — still shows.
 */
export function shouldSuppressForegroundPush(
  data: unknown,
  route: string | null = currentRoute,
): boolean {
  if (!data || typeof data !== 'object') return false;
  const screen = (data as { screen?: unknown }).screen;
  return screen === CHAT_SCREEN && route === CHAT_SCREEN;
}
