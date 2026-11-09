import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createTourTargetRegistry, TourTargetContext } from '@/src/components/tour/tour-target';
import { TOUR_ID, TOUR_RELEASED_AT, TOUR_STEPS, type TourFinishCta } from '@/src/constants/tour';
import { useUser } from '@/src/context/user-context';
import { Events } from '@/src/services/analytics.service';
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

function markTourSeen(): void {
  Promise.resolve()
    .then(() => AsyncStorage.setItem(TOUR_SEEN_KEY, TOUR_ID))
    .catch(logger.catchAsync('tour_save'));
}

/**
 * - `idle`: nothing on screen.
 * - `offer`: the welcome card ("Show me around"), shown on Home only.
 * - `running`: step `stepIndex` of TOUR_STEPS.
 * - `finished`: the "constellation complete" card.
 */
export type TourStatus = 'idle' | 'offer' | 'running' | 'finished';

export interface TourContextValue {
  status: TourStatus;
  stepIndex: number;
  accept(): void;
  decline(): void;
  next(): void;
  back(): void;
  skip(): void;
  complete(cta: TourFinishCta): void;
  /** Profile → Replay app tour. Starts at step one, no offer card. */
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
    decidedFor.current = uid;

    let cancelled = false;
    Promise.resolve()
      .then(() => AsyncStorage.getItem(TOUR_SEEN_KEY))
      .then((raw) => {
        if (cancelled) return;
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
          Events.tourOffered();
        } else {
          setStatus('idle');
          if (decision === 'stamp-silently') markTourSeen();
        }
      })
      // Unreadable storage: don't offer. Offering on every launch would be
      // worse than a new user missing the tour; Profile can still replay it.
      .catch(logger.catchAsync('tour_read'));
    return () => {
      cancelled = true;
    };
  }, [signedIn, userDoc, uid, createdAtMs]);

  const accept = useCallback(() => {
    setStepIndex(0);
    setStatus('running');
    Events.tourStarted({ source: 'offer' });
  }, []);

  const decline = useCallback(() => {
    setStatus('idle');
    markTourSeen();
    Events.tourDeclined();
  }, []);

  const replay = useCallback(() => {
    setOwner(uid);
    setStepIndex(0);
    setStatus('running');
    Events.tourStarted({ source: 'profile' });
  }, [uid]);

  const next = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      setStatus('finished');
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => {
    const step = TOUR_STEPS[stepIndex];
    setStatus('idle');
    markTourSeen();
    if (step) Events.tourSkipped({ step_id: step.id, step_index: stepIndex });
  }, [stepIndex]);

  const complete = useCallback((cta: TourFinishCta) => {
    setStatus('idle');
    markTourSeen();
    Events.tourCompleted({ cta });
  }, []);

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
