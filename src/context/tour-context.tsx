import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createTourTargetRegistry, TourTargetContext } from '@/src/components/tour/tour-target';
import { TOUR_ID, TOUR_RELEASED_AT, TOUR_STEPS } from '@/src/constants/tour';
import { useUser } from '@/src/context/user-context';
import { setAnalyticsSuppressed } from '@/src/services/analytics.service';
import { toDate } from '@/src/utils/firestore-date';
import { logger } from '@/src/utils/logger';
import { decideTour, parseTourSeen, TOUR_SEEN_KEY } from '@/src/utils/tour-policy';

// Same guard as use-whats-new: a build without the native module reads as
// "nothing saved" and writes nowhere, rather than crashing.
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

// The tour is not reported to analytics, and neither is anything it causes:
// it opens Connections, Transits and Chat itself, and those would otherwise log
// screen views and events the user never chose. Switched synchronously in the
// actions (so a finish link's navigation counts again) and backed by an effect
// on `status` (so signing out mid-tour can't leave it on).

function markTourSeen(): void {
  Promise.resolve()
    .then(() => AsyncStorage.setItem(TOUR_SEEN_KEY, TOUR_ID))
    .catch(logger.catchAsync('tour_save'));
}

/**
 * - `idle`: nothing on screen.
 * - `offer`: the welcome card ("Show me around"), shown on Home only.
 * - `running`: step `stepIndex` of TOUR_STEPS.
 */
export type TourStatus = 'idle' | 'offer' | 'running';

export interface TourContextValue {
  status: TourStatus;
  stepIndex: number;
  accept(): void;
  decline(): void;
  next(): void;
  back(): void;
  skip(): void;
  /** Finish on the last step: closes the tour where it stands (Home). */
  complete(): void;
  /** Profile → Walkthrough. Starts at step one, no offer card. */
  replay(): void;
}

const noop = () => {};

/** Outside a provider (tests, screens rendered alone) every action is a no-op. */
const TourContext = createContext<TourContextValue>({
  status: 'idle',
  stepIndex: 0,
  accept: noop,
  decline: noop,
  next: noop,
  back: noop,
  skip: noop,
  complete: noop,
  replay: noop,
});

export function useTour(): TourContextValue {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { authUser, userDoc } = useUser();
  const [registry] = useState(createTourTargetRegistry);
  const [rawStatus, setStatus] = useState<TourStatus>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  /** Whose tour is on screen. Signing out (or into another account) hides it. */
  const [owner, setOwner] = useState<string | null>(null);
  const decidedFor = useRef<string | null>(null);

  const uid = authUser?.uid ?? null;
  const status: TourStatus = owner !== null && owner === uid ? rawStatus : 'idle';
  const signedIn = !!uid && authUser?.emailVerified === true;
  const createdAtMs = toDate((userDoc as { createdAt?: unknown } | null)?.createdAt)?.getTime() ?? null;

  // Signing out lets the next sign-in decide afresh (the tour itself is
  // already hidden by `owner`, and the decision below resets it).
  useEffect(() => {
    if (!uid) decidedFor.current = null;
  }, [uid]);

  // Decide once per signed-in account per launch, after the user doc has
  // loaded so the account's age is real rather than a placeholder.
  useEffect(() => {
    if (!signedIn || !userDoc || !uid || decidedFor.current === uid) return;

    // `decidedFor` is set only once a read survives to be applied. A new
    // `userDoc` snapshot (the pending `createdAt` resolving, a `lastActiveAt`
    // write) cancels the read in flight, and marking the account decided up
    // front made the re-run bail too, so the tour was never offered.
    let cancelled = false;
    Promise.resolve()
      .then(() => AsyncStorage.getItem(TOUR_SEEN_KEY))
      .then((raw) => {
        if (cancelled) return;
        decidedFor.current = uid;
        const decision = decideTour({
          seenId: parseTourSeen(raw),
          accountCreatedAt: createdAtMs,
          releasedAt: TOUR_RELEASED_AT,
          now: Date.now(),
        });
        setOwner(uid);
        setStepIndex(0);
        if (decision === 'offer') {
          setStatus('offer');
        } else {
          setStatus('idle');
          if (decision === 'stamp-silently') markTourSeen();
        }
      })
      // Unreadable storage: don't offer. Offering on every launch would be
      // worse than a new user missing the tour; Profile can still replay it.
      .catch((err: unknown) => {
        // Decided too, or every later snapshot would retry and re-report.
        if (!cancelled) decidedFor.current = uid;
        logger.catchAsync('tour_read')(err);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, userDoc, uid, createdAtMs]);

  const accept = useCallback(() => {
    setStepIndex(0);
    setStatus('running');
    setAnalyticsSuppressed(true);
  }, []);

  const decline = useCallback(() => {
    setStatus('idle');
    setAnalyticsSuppressed(false);
    markTourSeen();
  }, []);

  const replay = useCallback(() => {
    setOwner(uid);
    setStepIndex(0);
    setStatus('running');
    setAnalyticsSuppressed(true);
  }, [uid]);

  const complete = useCallback(() => {
    setStatus('idle');
    setAnalyticsSuppressed(false);
    markTourSeen();
  }, []);

  // There is no "you're done" screen: Finish on the last step just closes it.
  const next = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      complete();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex, complete]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => {
    setStatus('idle');
    setAnalyticsSuppressed(false);
    markTourSeen();
  }, []);

  const touring = status === 'running';
  useEffect(() => {
    setAnalyticsSuppressed(touring);
  }, [touring]);

  const value = useMemo<TourContextValue>(
    () => ({ status, stepIndex, accept, decline, next, back, skip, complete, replay }),
    [status, stepIndex, accept, decline, next, back, skip, complete, replay],
  );

  return (
    <TourTargetContext.Provider value={registry}>
      <TourContext.Provider value={value}>{children}</TourContext.Provider>
    </TourTargetContext.Provider>
  );
}
