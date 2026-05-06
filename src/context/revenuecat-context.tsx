/**
 * revenuecat-context.tsx
 * Provides RevenueCat subscription state to the entire app.
 *
 * - Configures the SDK on mount
 * - Links RevenueCat user to Firebase Auth UID
 * - Exposes `isPro` boolean, customer info, and purchase helpers
 * - Listens for real-time CustomerInfo updates (renewal, expiry, etc.)
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import {
  configureRevenueCat,
  loginUser,
  logoutUser,
  getCustomerInfo,
  hasEntitlement,
  restorePurchases as restorePurchasesService,
  onCustomerInfoUpdate,
  ENTITLEMENT_ID,
  REVENUECAT_ENABLED,
} from '@/src/services/revenuecat.service';
import { useUser } from './user-context';
import { Events } from '@/src/services/analytics.service';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // Native module unavailable — devPlan will not persist.
}

const DEV_PLAN_KEY_PREFIX = 'revenuecat.devPlan.v1';
const devPlanStorageKey = (uid: string | null | undefined) =>
  `${DEV_PLAN_KEY_PREFIX}.${uid ?? 'anonymous'}`;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * `auto` = no admin override; access is computed from real subscription state
 *          + the natural 5-day trial window from `userDoc.createdAt`.
 * `free` / `freeTrial` / `premium` = explicit admin overrides.
 */
export type DevPlan = 'auto' | 'free' | 'freeTrial' | 'premium';

interface RevenueCatContextValue {
  /** Whether the user has the "Delaluna Answers Pro" entitlement */
  isPro: boolean;
  /** Latest CustomerInfo from RevenueCat */
  customerInfo: CustomerInfo | null;
  /** True while the initial customer info is loading */
  loading: boolean;
  /** Re-fetch customer info from RevenueCat */
  refresh: () => Promise<void>;
  /** Restore previous purchases */
  restorePurchases: () => Promise<boolean>;
  /** Present the RevenueCat paywall modal. Returns true if a purchase/restore occurred. */
  presentPaywall: () => Promise<boolean>;
  /** Present the paywall only if the user does NOT have the pro entitlement */
  presentPaywallIfNeeded: () => Promise<boolean>;
  /** Present the RevenueCat Customer Center for subscription management */
  presentCustomerCenter: () => Promise<void>;
  /**
   * True when the SDK is disabled (no production API key). In this mode
   * `isPro` is driven by `devPlan` instead of the paywall.
   */
  isDevMode: boolean;
  /** Current dev plan when RevenueCat is disabled. */
  devPlan: DevPlan;
  /** Set the dev plan (free / freeTrial / premium). No-op when SDK is enabled. */
  setDevPlan: (plan: DevPlan) => void;
  /** Flip the local pro flag when RevenueCat is disabled. No-op otherwise. */
  toggleDevPro: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RevenueCatContext = createContext<RevenueCatContextValue>({
  isPro: false,
  customerInfo: null,
  loading: true,
  refresh: async () => {},
  restorePurchases: async () => false,
  presentPaywall: async () => false,
  presentPaywallIfNeeded: async () => false,
  presentCustomerCenter: async () => {},
  isDevMode: !REVENUECAT_ENABLED,
  devPlan: 'auto',
  setDevPlan: () => {},
  toggleDevPro: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(REVENUECAT_ENABLED);
  const configuredRef = useRef(false);
  const loggedInUidRef = useRef<string | null>(null);

  // Placeholder plan — lets the client test free / free-trial / premium
  // flows via the mock paywall, regardless of real RevenueCat state.
  // Persisted per-account so admin overrides survive reload and don't leak
  // between users on the same device.
  const [devPlan, setDevPlanState] = useState<DevPlan>('auto');

  // Placeholder always drives isPro so the mock paywall works in every build.
  const isPro = devPlan === 'premium';

  // Hydrate devPlan from AsyncStorage when the auth user changes.
  useEffect(() => {
    let cancelled = false;
    if (!AsyncStorage) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(devPlanStorageKey(authUser?.uid));
        if (cancelled) return;
        if (raw === 'auto' || raw === 'free' || raw === 'freeTrial' || raw === 'premium') {
          setDevPlanState(raw);
        } else {
          setDevPlanState('auto');
        }
      } catch {
        // ignore — fall back to in-memory state
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  const setDevPlan = useCallback((plan: DevPlan) => {
    setDevPlanState(plan);
    if (AsyncStorage) {
      AsyncStorage.setItem(devPlanStorageKey(authUser?.uid), plan).catch(() => {});
    }
  }, [authUser?.uid]);

  const toggleDevPro = useCallback(() => {
    setDevPlanState((prev) => {
      const cycle: DevPlan[] = ['auto', 'free', 'freeTrial', 'premium'];
      const idx = cycle.indexOf(prev);
      const next = cycle[(idx === -1 ? 0 : idx + 1) % cycle.length];
      if (AsyncStorage) {
        AsyncStorage.setItem(devPlanStorageKey(authUser?.uid), next).catch(() => {});
      }
      return next;
    });
  }, [authUser?.uid]);

  // ── Configure SDK once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (configuredRef.current) return;
    configuredRef.current = true;
    configureRevenueCat();
  }, []);

  // ── Link to Firebase user & fetch initial customer info ─────────────────────
  useEffect(() => {
    if (!REVENUECAT_ENABLED) return;

    let cancelled = false;

    async function syncUser() {
      try {
        if (authUser?.uid) {
          const { customerInfo: info } = await loginUser(authUser.uid);
          loggedInUidRef.current = authUser.uid;
          if (!cancelled) setCustomerInfo(info);
        } else if (loggedInUidRef.current) {
          // User signed out — reset to anonymous (only if we previously logged in)
          loggedInUidRef.current = null;
          try {
            await logoutUser();
          } catch {
            // Already anonymous — ignore
          }
          if (!cancelled) setCustomerInfo(null);
        } else {
          // No prior login — SDK is already anonymous, just fetch initial info
          if (!cancelled) setCustomerInfo(null);
        }
      } catch (err) {
        console.error('[RevenueCat] syncUser error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    syncUser();
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  // ── Listen for real-time updates ────────────────────────────────────────────
  useEffect(() => {
    if (!REVENUECAT_ENABLED) return;
    const unsubscribe = onCustomerInfoUpdate((info) => {
      setCustomerInfo(info);
    });
    return unsubscribe;
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!REVENUECAT_ENABLED) return;
    try {
      const info = await getCustomerInfo();
      setCustomerInfo(info);
    } catch (err) {
      console.error('[RevenueCat] refresh error:', err);
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!REVENUECAT_ENABLED) return true;
    try {
      const info = await restorePurchasesService();
      setCustomerInfo(info);
      const ok = hasEntitlement(info);
      Events.restorePurchases({ success: ok });
      return ok;
    } catch (err) {
      console.error('[RevenueCat] restorePurchases error:', err);
      Events.restorePurchases({ success: false });
      return false;
    }
  }, []);

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    if (!REVENUECAT_ENABLED) {
      console.log('[RevenueCat] disabled — skipping presentPaywall');
      return false;
    }
    try {
      Events.paywallViewed('manual');
      const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywall();
      // Refresh customer info after paywall interaction
      await refresh();
      const purchased = result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
      if (purchased) {
        Events.purchaseCompleted({ product_id: 'unknown' });
      } else {
        Events.paywallDismissed('manual');
      }
      return purchased;
    } catch (err) {
      console.error('[RevenueCat] presentPaywall error:', err);
      Events.purchaseFailed({ product_id: 'unknown', reason: String((err as any)?.message ?? err) });
      return false;
    }
  }, [refresh]);

  const presentPaywallIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!REVENUECAT_ENABLED) {
      console.log('[RevenueCat] disabled — skipping presentPaywallIfNeeded');
      return false;
    }
    try {
      Events.paywallViewed('gated');
      const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
      });
      await refresh();
      const purchased = result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
      if (purchased) {
        Events.purchaseCompleted({ product_id: 'unknown' });
      } else if (result !== PAYWALL_RESULT.NOT_PRESENTED) {
        Events.paywallDismissed('gated');
      }
      return purchased;
    } catch (err) {
      console.error('[RevenueCat] presentPaywallIfNeeded error:', err);
      Events.purchaseFailed({ product_id: 'unknown', reason: String((err as any)?.message ?? err) });
      return false;
    }
  }, [refresh]);

  const presentCustomerCenter = useCallback(async () => {
    if (!REVENUECAT_ENABLED) {
      console.log('[RevenueCat] disabled — skipping presentCustomerCenter');
      return;
    }
    try {
      await RevenueCatUI.presentCustomerCenter();
      // Refresh after user manages their subscription
      await refresh();
    } catch (err) {
      console.error('[RevenueCat] presentCustomerCenter error:', err);
    }
  }, [refresh]);

  return (
    <RevenueCatContext.Provider
      value={{
        isPro,
        customerInfo,
        loading,
        refresh,
        restorePurchases,
        presentPaywall,
        presentPaywallIfNeeded,
        presentCustomerCenter,
        isDevMode: !REVENUECAT_ENABLED,
        devPlan,
        setDevPlan,
        toggleDevPro,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRevenueCat() {
  return useContext(RevenueCatContext);
}
