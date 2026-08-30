import { useCallback, useEffect, useRef } from 'react';

import { useUser }       from '@/src/context/user-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import {
  logScreenLoad,
  logOperation,
  logError as logErrorToFirestore,
} from '@/src/services/perf-log.service';

/**
 * Tracks screen load time and provides helpers for logging
 * named operations and errors — all tied to the given screen path.
 *
 * Usage:
 *   const { markReady, logOp, logError } = useScreenPerfLog('/(main)/chat');
 *
 *   // call once when content is ready:
 *   useEffect(() => { if (!loading) markReady(); }, [loading]);
 *
 *   // wrap timed operations:
 *   const t = Date.now();
 *   await doWork();
 *   logOp('operation_name', Date.now() - t);
 *
 * Every performanceLogs write is gated on `request.auth != null` (see
 * firestore.rules), so nothing is written while signed out — such a write is
 * denied outright and only produces a warning. Screens are typically marked
 * ready off data-loading state, which can settle before the auth session
 * restores, so a load time measured too early is held and flushed once the
 * user resolves rather than dropped on the floor.
 */
export function useScreenPerfLog(screenPath: string) {
  const { authUser } = useUser();
  const { isPro }    = useRevenueCat();

  const mountTime = useRef(Date.now());
  const reported  = useRef(false);

  // Load time measured before an auth session existed, awaiting a flush.
  const pendingLoadMs = useRef<number | null>(null);

  // Keep latest context in a ref so the stable callbacks always read
  // the most recent authUser/isPro without being recreated.
  const ctxRef = useRef({ authUser, isPro });
  ctxRef.current = { authUser, isPro };

  const markReady = useCallback(() => {
    if (reported.current) return;
    const durationMs = Date.now() - mountTime.current;

    if (!ctxRef.current.authUser) {
      pendingLoadMs.current = durationMs;
      return;
    }

    reported.current = true;
    logScreenLoad(screenPath, durationMs, {
      userId: ctxRef.current.authUser.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  // Flush a load time captured before sign-in. On the (auth) screens the user
  // never resolves and it is simply dropped — those writes could never have
  // landed anyway.
  useEffect(() => {
    if (!authUser || reported.current || pendingLoadMs.current === null) return;

    reported.current = true;
    logScreenLoad(screenPath, pendingLoadMs.current, {
      userId: authUser.uid,
      isPro:  ctxRef.current.isPro,
    });
    pendingLoadMs.current = null;
  }, [authUser, screenPath]);

  const logOp = useCallback((operationName: string, durationMs: number) => {
    const { authUser: user, isPro: pro } = ctxRef.current;
    if (!user) return;

    logOperation(screenPath, operationName, durationMs, {
      userId: user.uid,
      isPro:  pro,
    });
  }, [screenPath]);

  const logError = useCallback((message: string) => {
    const { authUser: user, isPro: pro } = ctxRef.current;
    if (!user) return;

    logErrorToFirestore(screenPath, message, {
      userId: user.uid,
      isPro:  pro,
    });
  }, [screenPath]);

  return { markReady, logOp, logError };
}
