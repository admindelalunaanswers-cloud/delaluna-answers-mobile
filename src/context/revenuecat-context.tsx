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

// ─── Types ────────────────────────────────────────────────────────────────────

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
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(REVENUECAT_ENABLED);
  const configuredRef = useRef(false);

  // Derive pro status from customer info.
  // When RevenueCat is disabled we default to `true` so premium features
  // stay unlocked in testing builds that don't have a real API key.
  const isPro = REVENUECAT_ENABLED
    ? customerInfo
      ? hasEntitlement(customerInfo)
      : false
    : true;

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
          if (!cancelled) setCustomerInfo(info);
        } else {
          // User signed out — reset to anonymous
          try {
            await logoutUser();
          } catch {
            // Already anonymous — ignore
          }
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
      return hasEntitlement(info);
    } catch (err) {
      console.error('[RevenueCat] restorePurchases error:', err);
      return false;
    }
  }, []);

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    if (!REVENUECAT_ENABLED) {
      console.log('[RevenueCat] disabled — skipping presentPaywall');
      return false;
    }
    try {
      const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywall();
      // Refresh customer info after paywall interaction
      await refresh();
      return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
    } catch (err) {
      console.error('[RevenueCat] presentPaywall error:', err);
      return false;
    }
  }, [refresh]);

  const presentPaywallIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!REVENUECAT_ENABLED) {
      console.log('[RevenueCat] disabled — skipping presentPaywallIfNeeded');
      return false;
    }
    try {
      const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
      });
      await refresh();
      return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
    } catch (err) {
      console.error('[RevenueCat] presentPaywallIfNeeded error:', err);
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
