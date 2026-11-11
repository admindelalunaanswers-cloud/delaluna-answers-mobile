import {
  CHAT_SCREEN,
  getForegroundRoute,
  setForegroundRoute,
  shouldSuppressForegroundPush,
} from '@/src/utils/foreground-push-policy';
import { routeKeyForSegments } from '@/src/services/analytics.service';

describe('shouldSuppressForegroundPush', () => {
  afterEach(() => setForegroundRoute(null));

  it('holds back a chat reply while the chat is on screen', () => {
    expect(shouldSuppressForegroundPush({ screen: CHAT_SCREEN }, CHAT_SCREEN)).toBe(true);
  });

  it('still shows a chat reply on any other screen', () => {
    expect(shouldSuppressForegroundPush({ screen: CHAT_SCREEN }, '/(main)')).toBe(false);
    expect(shouldSuppressForegroundPush({ screen: CHAT_SCREEN }, null)).toBe(false);
  });

  it('still shows every other push in the chat', () => {
    expect(
      shouldSuppressForegroundPush({ screen: '/connection/[id]/synastry' }, CHAT_SCREEN),
    ).toBe(false);
    expect(shouldSuppressForegroundPush({}, CHAT_SCREEN)).toBe(false);
    expect(shouldSuppressForegroundPush(undefined, CHAT_SCREEN)).toBe(false);
  });

  it('reads the route the layout last set', () => {
    setForegroundRoute(CHAT_SCREEN);
    expect(getForegroundRoute()).toBe(CHAT_SCREEN);
    expect(shouldSuppressForegroundPush({ screen: CHAT_SCREEN })).toBe(true);
  });

  // The layout sets the route from routeKeyForSegments, and notifyChatReply
  // sends `data.screen: "/(main)/chat"`. If either drifts, this stops working.
  it('matches the key the root layout derives for the chat tab', () => {
    expect(routeKeyForSegments(['(main)', 'chat'])).toBe(CHAT_SCREEN);
  });
});
