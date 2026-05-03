/**
 * use-free-trial-access.ts
 * Determines whether the user has access to gated features.
 *
 * Free users get full premium-equivalent access for 5 days after the
 * Firestore user doc is created (`userDoc.createdAt`). After the trial
 * expires, gated screens (chat, connections, premium-only transits) become
 * locked and ads are shown unless the user upgrades to Premium.
 *
 * `devPlan` overrides (from RevenueCatContext) are still honored so QA can
 * force-test free / trial / premium states regardless of the real timestamp.
 */

import { useMemo } from 'react';

import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useUser } from '@/src/context/user-context';

export const TRIAL_DURATION_DAYS = 5;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

export interface FreeTrialAccess {
  /** True if Pro OR within the 5-day free trial window. */
  hasAccess: boolean;
  /** True if user is currently inside the 5-day free trial window (regardless of Pro status). */
  inTrial: boolean;
  /** True if the user is free AND the 5-day trial has elapsed. */
  trialExpired: boolean;
  /** Milliseconds remaining in the trial window (0 if expired or unknown). */
  msRemaining: number;
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function useFreeTrialAccess(): FreeTrialAccess {
  const { userDoc } = useUser();
  const { isPro, devPlan } = useRevenueCat();

  return useMemo(() => {
    // QA override: dev plan forces a specific state.
    if (devPlan === 'premium') {
      return { hasAccess: true, inTrial: false, trialExpired: false, msRemaining: 0 };
    }
    if (devPlan === 'freeTrial') {
      return { hasAccess: true, inTrial: true, trialExpired: false, msRemaining: TRIAL_DURATION_MS };
    }

    if (isPro) {
      return { hasAccess: true, inTrial: false, trialExpired: false, msRemaining: 0 };
    }

    // No Pro, no override — compute trial window from account creation.
    const rawCreatedAt = (userDoc as any)?.createdAt;
    const createdAtMs = toMillis(rawCreatedAt);

    console.log('[useFreeTrialAccess] createdAt debug:', {
      rawCreatedAt,
      rawType: typeof rawCreatedAt,
      hasToMillis: typeof rawCreatedAt?.toMillis === 'function',
      hasToDate: typeof rawCreatedAt?.toDate === 'function',
      createdAtMs,
      createdAtISO: createdAtMs != null ? new Date(createdAtMs).toISOString() : null,
      nowMs: Date.now(),
      nowISO: new Date().toISOString(),
    });

    if (createdAtMs == null) {
      // userDoc not loaded yet — treat as no access without flagging expired
      return { hasAccess: false, inTrial: false, trialExpired: false, msRemaining: 0 };
    }

    const elapsed = Date.now() - createdAtMs;
    const msRemaining = Math.max(0, TRIAL_DURATION_MS - elapsed);
    const inTrial = msRemaining > 0;

    console.log('[useFreeTrialAccess] trial state:', {
      elapsedMs: elapsed,
      elapsedDays: (elapsed / (24 * 60 * 60 * 1000)).toFixed(2),
      msRemaining,
      daysRemaining: (msRemaining / (24 * 60 * 60 * 1000)).toFixed(2),
      inTrial,
    });

    return {
      hasAccess: inTrial,
      inTrial,
      trialExpired: !inTrial,
      msRemaining,
    };
  }, [isPro, devPlan, userDoc]);
}
