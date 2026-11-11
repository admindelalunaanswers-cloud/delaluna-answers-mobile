import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TOUR_RELEASED_AT } from '@/src/constants/tour';
import { WHATS_NEW, type WhatsNewItem } from '@/src/constants/whats-new';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useUser } from '@/src/context/user-context';
import { Events } from '@/src/services/analytics.service';
import { toDate } from '@/src/utils/firestore-date';
import { logger } from '@/src/utils/logger';
import { isNewAccount } from '@/src/utils/tour-policy';
import {
  decideWhatsNew,
  itemsForAudience,
  parseSeenId,
  WHATS_NEW_SEEN_KEY,
} from '@/src/utils/whats-new-policy';

// Same guard as accessibility-context: a build without the native module reads
// as "nothing saved" and writes nowhere, rather than crashing.
let AsyncStorage: {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
};
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod.default ?? mod;
} catch {
  AsyncStorage = { getItem: async () => null, setItem: async () => {} };
}

/** Records the current release as seen on this device. Fire-and-forget. */
export function markWhatsNewSeen(id: string = WHATS_NEW.id): void {
  Promise.resolve()
    .then(() => AsyncStorage.setItem(WHATS_NEW_SEEN_KEY, id))
    .catch(logger.catchAsync('whats_new_save'));
}

/** The current release's items for this user's plan. */
export function useWhatsNewItems(): WhatsNewItem[] {
  const { hasFullAccess } = useRevenueCat();
  return useMemo(() => itemsForAudience(WHATS_NEW.items, hasFullAccess), [hasFullAccess]);
}

export type WhatsNewCloseReason = 'button' | 'backdrop' | 'back';

/**
 * Decides once per launch whether to auto-show the sheet, then shows it while
 * `active` — the caller passes "on the Home tab", so it never opens over a
 * deep-linked screen and simply waits for Home instead.
 */
export function useWhatsNew(active: boolean) {
  const { authUser, userDoc } = useUser();
  const { loading: purchasesLoading } = useRevenueCat();
  const items = useWhatsNewItems();

  const [eligible, setEligible] = useState(false);
  const decided = useRef(false);
  const shownLogged = useRef(false);

  const signedIn = !!authUser?.uid && authUser.emailVerified === true;
  const createdAtMs = toDate((userDoc as { createdAt?: unknown } | null)?.createdAt)?.getTime() ?? null;

  useEffect(() => {
    // Wait for the user doc (account age) and the plan (which items), so the
    // decision isn't made on placeholders and the list doesn't change under
    // someone already reading it.
    if (decided.current || !signedIn || !userDoc || purchasesLoading) return;

    // Decided only once a read survives to be applied — same as the tour.
    // A new `userDoc` snapshot cancels the read in flight, and marking it
    // decided up front made the re-run bail, so the sheet never showed.
    let cancelled = false;
    Promise.resolve()
      .then(() => AsyncStorage.getItem(WHATS_NEW_SEEN_KEY))
      .then((raw) => {
        if (cancelled) return;
        decided.current = true;
        const decision = decideWhatsNew({
          seenId: parseSeenId(raw),
          currentId: WHATS_NEW.id,
          accountCreatedAt: createdAtMs,
          releasedAt: WHATS_NEW.releasedAt,
          itemCount: items.length,
          newAccount: isNewAccount({
            accountCreatedAt: createdAtMs,
            releasedAt: TOUR_RELEASED_AT,
            now: Date.now(),
          }),
        });
        if (decision === 'show') setEligible(true);
        else if (decision === 'stamp-silently') markWhatsNewSeen();
      })
      // Unreadable storage: don't show. Re-showing every launch would be worse
      // than missing one release.
      .catch((err: unknown) => {
        // A cancelled read has a successor that will report; this one doesn't.
        if (cancelled) return;
        decided.current = true;
        logger.catchAsync('whats_new_read')(err);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, userDoc, purchasesLoading, createdAtMs, items.length]);

  const visible = eligible && active;

  useEffect(() => {
    if (!visible || shownLogged.current) return;
    shownLogged.current = true;
    Events.whatsNewShown({ release_id: WHATS_NEW.id, source: 'auto' });
  }, [visible]);

  const close = useCallback((reason: WhatsNewCloseReason) => {
    setEligible(false);
    markWhatsNewSeen();
    Events.whatsNewDismissed({ release_id: WHATS_NEW.id, reason });
  }, []);

  const openItem = useCallback((item: WhatsNewItem) => {
    setEligible(false);
    markWhatsNewSeen();
    Events.whatsNewCta({ release_id: WHATS_NEW.id, item_id: item.id });
  }, []);

  return { visible, release: WHATS_NEW, items, close, openItem };
}
