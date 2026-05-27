import { useCallback, useRef } from 'react';

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
 */
export function useScreenPerfLog(screenPath: string) {
  const { authUser } = useUser();
  const { isPro }    = useRevenueCat();

  const mountTime = useRef(Date.now());
  const reported  = useRef(false);

  // Keep latest context in a ref so the stable callbacks always read
  // the most recent authUser/isPro without being recreated.
  const ctxRef = useRef({ authUser, isPro });
  ctxRef.current = { authUser, isPro };

  const markReady = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    logScreenLoad(screenPath, Date.now() - mountTime.current, {
      userId: ctxRef.current.authUser?.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  const logOp = useCallback((operationName: string, durationMs: number) => {
    logOperation(screenPath, operationName, durationMs, {
      userId: ctxRef.current.authUser?.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  const logError = useCallback((message: string) => {
    logErrorToFirestore(screenPath, message, {
      userId: ctxRef.current.authUser?.uid,
      isPro:  ctxRef.current.isPro,
    });
  }, [screenPath]);

  return { markReady, logOp, logError };
}
