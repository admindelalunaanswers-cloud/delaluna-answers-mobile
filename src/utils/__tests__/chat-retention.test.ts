import {
  CHAT_ACCESS_DAYS,
  chatAccessEndsAt,
  chatExpiryLabel,
  isChatAccessible,
} from '@/src/utils/chat-retention';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-21T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const session = (...ages: number[]) => ({
  savedAt: NOW,
  messages: ages.map((n) => ({ createdAt: daysAgo(n) })),
});

describe('chat retention (client mirror)', () => {
  // Must match CHAT_ACCESS_DAYS in functions/src/chat-retention.ts.
  it('gives users 60 days', () => {
    expect(CHAT_ACCESS_DAYS).toBe(60);
  });

  // Counted from the latest turn, so a long chat never goes half-missing.
  it('runs the window from the most recent turn', () => {
    expect(chatAccessEndsAt(session(90, 10)).getTime()).toBe(daysAgo(10).getTime() + 60 * DAY);
    expect(isChatAccessible(session(90, 10), NOW)).toBe(true);
  });

  // Existing chats count from their original dates.
  it('hides a chat once its last turn is past 60 days', () => {
    expect(isChatAccessible(session(61), NOW)).toBe(false);
    expect(isChatAccessible(session(59), NOW)).toBe(true);
  });

  it("prefers the server's stamp once it lands", () => {
    const stamped = { ...session(1), expireAt: daysAgo(1) };
    expect(isChatAccessible(stamped, NOW)).toBe(false);
  });

  it('warns only in the final week', () => {
    expect(chatExpiryLabel(session(30), NOW)).toBeNull();
    expect(chatExpiryLabel(session(57), NOW)).toBe('Expires in 3 days');
    expect(chatExpiryLabel(session(59.5), NOW)).toBe('Expires today');
  });
});
