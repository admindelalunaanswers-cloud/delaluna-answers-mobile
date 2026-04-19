/**
 * use-free-trial-access.ts
 * Determines whether the user has access to gated features.
 *
 * Free users get full access for 24 hours after signup. After the trial
 * expires, gated screens (chat, connections, premium-only transits) become
 * locked unless the user upgrades to Premium.
 */

import { useMemo } from 'react';

import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useUser } from '@/src/context/user-context';

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

export interface FreeTrialAccess {
  /** True if Pro OR within the 24h free trial window. */
  hasAccess: boolean;
  /** True if user is currently inside the 24h free trial window (regardless of Pro status). */
  inTrial: boolean;
  /** True if the user is free AND the 24h trial has elapsed. */
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
    // Placeholder plan drives trial state so the client can test all flows.
    const isTrial = devPlan === 'freeTrial';
    return {
      hasAccess: isPro || isTrial,
      inTrial: isTrial,
      trialExpired: devPlan === 'free',
      msRemaining: isTrial ? TRIAL_DURATION_MS : 0,
    };
  }, [isPro, devPlan]);
}
