import { useMemo } from 'react';

import { useRevenueCat } from '@/src/context/revenuecat-context';

export interface FreeTrialAccess {
  /** True if Pro. */
  hasAccess: boolean;
  /** Always false — free trial has been removed. */
  inTrial: boolean;
  /** True if the user is not Pro. */
  trialExpired: boolean;
  /** Always 0 — free trial has been removed. */
  msRemaining: number;
}

export function useFreeTrialAccess(): FreeTrialAccess {
  const { isPro } = useRevenueCat();

  return useMemo(() => ({
    hasAccess: isPro,
    inTrial: false,
    trialExpired: !isPro,
    msRemaining: 0,
  }), [isPro]);
}
