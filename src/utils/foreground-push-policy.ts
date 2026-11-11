/**
 * Which pushes to hold back while the app is open.
 *
 * `notifyChatReply` skips users whose `lastActiveAt` is under 30s old, but that
 * field is only written when the app comes to the foreground — so anyone who
 * has been in the app longer than 30s looks away, and the reply push arrives as
 * a banner over the very chat that is already showing the answer. The server
 * cannot know which screen is up; the device can, so the decision lives here.
 *
 * Pure and dependency-free on purpose: the root layout writes the route and the
 * notification handler (loaded lazily) reads it, without either importing the
 * other.
 */

/** The route key (`routeKeyForSegments`) and push `data.screen` of the chat tab. */
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
