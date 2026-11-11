import type { WhatsNewItem } from '@/src/constants/whats-new';

/**
 * When the "What's new" sheet shows. Pure, so every case is unit-tested;
 * storage and React live in src/hooks/use-whats-new.ts.
 */

/** Device-local, like the accessibility prefs. Bump the suffix only to re-show to everyone on a format change. */
export const WHATS_NEW_SEEN_KEY = 'whatsNew:lastSeen:v1';

/**
 * - `show`: open the sheet; the id is saved when it is closed.
 * - `stamp-silently`: save the id without showing (a new account).
 * - `skip`: do nothing.
 */
export type WhatsNewDecision = 'show' | 'stamp-silently' | 'skip';

export function decideWhatsNew(args: {
  /** What storage holds — null when nothing was ever saved. */
  seenId: string | null;
  currentId: string;
  /** The account's `createdAt` in epoch ms, or null if unknown. */
  accountCreatedAt: number | null;
  releasedAt: number;
  /** Items left after the audience filter. */
  itemCount: number;
  /**
   * `isNewAccount` from tour-policy.ts. A new account gets the tour instead,
   * even on a device that saved an older release here (a second account, or
   * an update within the account's first week).
   */
  newAccount: boolean;
}): WhatsNewDecision {
  const { seenId, currentId, accountCreatedAt, releasedAt, itemCount, newAccount } = args;

  if (seenId === currentId) return 'skip';
  // Nothing for this user (e.g. every item is for the other plan): don't open an
  // empty sheet, and don't stamp either, so a later plan change still can.
  if (itemCount === 0) return 'skip';

  // New to the app: the tour is theirs, and there is nothing "new" to them.
  if (newAccount) return 'stamp-silently';

  // Saw an earlier release on this device: definitely an upgrade.
  if (seenId !== null) return 'show';

  // Nothing saved. Either a fresh install, or the first build that has this
  // feature — the case that matters most, since every existing user is in it.
  // The account's age tells them apart.
  //
  // Unknown age counts as new: a just-created user doc reports a pending
  // `serverTimestamp()` as null, and showing release notes to someone mid-
  // sign-up is worse than missing one release for a legacy doc without it.
  if (accountCreatedAt === null) return 'stamp-silently';
  return accountCreatedAt < releasedAt ? 'show' : 'stamp-silently';
}

/** `hasPremium` is `hasFullAccess` — paying, or an admin. */
export function itemsForAudience(
  items: readonly WhatsNewItem[],
  hasPremium: boolean,
): WhatsNewItem[] {
  return items.filter(
    (item) =>
      item.audience === 'all' ||
      (item.audience === 'premium' ? hasPremium : !hasPremium),
  );
}

/** Storage can hand back anything; only a non-empty string is an id. */
export function parseSeenId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}
