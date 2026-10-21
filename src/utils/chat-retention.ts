/**
 * chat-retention.ts
 * The user's 60-day window on saved chats, mirrored from
 * `functions/src/chat-retention.ts` (`CHAT_ACCESS_DAYS`, `savedChatExpireAt`).
 * Keep the two in step.
 *
 * The server's TTL policy is what actually removes an expired chat, but TTL
 * deletion can run a day or more after expiry, so the app hides anything past
 * the window itself rather than showing a chat it has said is gone.
 *
 * The legal archive (1,461 days) is server-only and never reaches the client.
 */

export const CHAT_ACCESS_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 60 days after the session's most recent turn, as the server computes it. */
export function chatAccessEndsAt(session: {
  messages: { createdAt: Date }[];
  savedAt: Date;
  expireAt?: Date;
}): Date {
  // The server's stamp wins once it lands; until then, derive the same date.
  if (session.expireAt) return session.expireAt;
  const times = session.messages.map((m) => m.createdAt.getTime());
  const base = times.length ? Math.max(...times) : session.savedAt.getTime();
  return new Date(base + CHAT_ACCESS_DAYS * DAY_MS);
}

export function isChatAccessible(
  session: Parameters<typeof chatAccessEndsAt>[0],
  now: Date = new Date(),
): boolean {
  return chatAccessEndsAt(session).getTime() > now.getTime();
}

/**
 * "Expires today" / "Expires in 3 days" during the last week, otherwise null —
 * a countdown on every row would be noise.
 */
export function chatExpiryLabel(
  session: Parameters<typeof chatAccessEndsAt>[0],
  now: Date = new Date(),
): string | null {
  const days = Math.ceil(
    (chatAccessEndsAt(session).getTime() - now.getTime()) / DAY_MS,
  );
  if (days > 7 || days < 1) return null;
  return days === 1 ? 'Expires today' : `Expires in ${days} days`;
}
