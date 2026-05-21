/**
 * revenuecat-context.tsx
 * Provides RevenueCat subscription state to the entire app.
 *
 * - Configures the SDK on mount
 * - Links RevenueCat user to Firebase Auth UID
 * - Exposes `isPro` boolean, customer info, and purchase helpers
 * - Listens for real-time CustomerInfo updates (renewal, expiry, etc.)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import {
  configureRevenueCat,
  loginUser,
  logoutUser,
  getCustomerInfo,
  getOfferings,
  hasEntitlement,
  restorePurchases as restorePurchasesService,
  onCustomerInfoUpdate,
  ENTITLEMENT_ID,
  CHAT_PACK_OFFERING_ID,
  CHAT_PACK_QUANTITIES,
  REVENUECAT_ENABLED,
} from '@/src/services/revenuecat.service';
import { useUser } from './user-context';
import { Events } from '@/src/services/analytics.service';
import { recordError } from '@/src/services/crashlytics.service';

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
 * `auto` = no admin override; access is computed from real subscription state.
 * `free` / `premium` = explicit admin overrides.
 */
export type DevPlan = 'auto' | 'free' | 'premium';

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
  /**
   * Present the RC paywall for the chat-pack IAP offering.
   * - `{ purchased: true; quantity: number }` — purchase completed; quantity of questions granted
   * - `'dismissed'`   — paywall shown but user closed without buying
   * - `'unavailable'` — RC disabled or offering not found; show fallback sheet
   */
  presentChatPackPaywall: () => Promise<{ purchased: true; quantity: number } | 'dismissed' | 'unavailable'>;
  /** Present the RevenueCat Customer Center for subscription management */
  presentCustomerCenter: () => Promise<void>;
  /**
   * True when the SDK is disabled (no production API key). In this mode
   * `isPro` is driven by `devPlan` instead of the paywall.
   */
  isDevMode: boolean;
  /** Current dev plan when RevenueCat is disabled. */
  devPlan: DevPlan;
  /** Set the dev plan (free / premium). No-op when SDK is enabled. */
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
  presentChatPackPaywall: async () => 'unavailable' as const satisfies 'unavailable',
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
  /** True only when configureRevenueCat() actually initialised the SDK. */
  const sdkReadyRef = useRef(false);
  const loggedInUidRef = useRef<string | null>(null);

  // Placeholder plan — lets the client test free / premium flows via the
  // mock paywall, regardless of real RevenueCat state. Persisted per-account
  // so admin overrides survive reload and don't leak between users on the same device.
  const [devPlan, setDevPlanState] = useState<DevPlan>('auto');

  const isPro = useMemo(() => {
    // Admin override: explicit plan selection (from admin screen) beats real state.
    if (devPlan !== 'auto') return devPlan === 'premium';
    // Use real RevenueCat entitlement on all platforms.
    if (!REVENUECAT_ENABLED || customerInfo === null) return false;
    return hasEntitlement(customerInfo);
  }, [customerInfo, devPlan]);

  // Hydrate devPlan from AsyncStorage when the auth user changes.
  useEffect(() => {
    let cancelled = false;
    if (!AsyncStorage) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(devPlanStorageKey(authUser?.uid));
        if (cancelled) return;
        if (raw === 'auto' || raw === 'free' || raw === 'premium') {
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
      const cycle: DevPlan[] = ['auto', 'free', 'premium'];
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
    sdkReadyRef.current = configureRevenueCat();
    // If the SDK could not be initialised (missing key in this build),
    // clear the loading flag so the app doesn't hang on a spinner.
    if (!sdkReadyRef.current) setLoading(false);
  }, []);

  // ── Link to Firebase user & fetch initial customer info ─────────────────────
  useEffect(() => {
    if (!REVENUECAT_ENABLED || !sdkReadyRef.current) return;

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
        recordError(err, 'rc_sync_user');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    syncUser();
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  // ── Listen for real-time updates ────────────────────────────────────────────
  useEffect(() => {
    if (!REVENUECAT_ENABLED || !sdkReadyRef.current) return;
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
      recordError(err, 'rc_refresh');
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
      recordError(err, 'rc_restore');
      Events.restorePurchases({ success: false });
      return false;
    }
  }, []);

  // Pull the product identifier out of the user's currently active Pro
  // entitlement. Falls back to 'unknown' if the entitlement isn't there yet
  // (e.g. CustomerInfo cache lag right after purchase).
  const resolvePurchasedProductId = useCallback(async (): Promise<string> => {
    try {
      const info = await getCustomerInfo();
      return info.entitlements.active[ENTITLEMENT_ID]?.productIdentifier ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }, []);

  const handlePaywallResult = useCallback(
    async (result: PAYWALL_RESULT, source: 'manual' | 'gated'): Promise<boolean> => {
      await refresh();
      if (result === PAYWALL_RESULT.PURCHASED) {
        Events.purchaseCompleted({ product_id: await resolvePurchasedProductId() });
        return true;
      }
      if (result === PAYWALL_RESULT.RESTORED) {
        Events.restorePurchases({ success: true });
        return true;
      }
      if (result !== PAYWALL_RESULT.NOT_PRESENTED) {
        Events.paywallDismissed(source);
      }
      return false;
    },
    [refresh, resolvePurchasedProductId],
  );

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    if (!REVENUECAT_ENABLED) {
      console.log('[RevenueCat] disabled — skipping presentPaywall');
      return false;
    }
    try {
      Events.paywallViewed('manual');
      const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywall();
      return await handlePaywallResult(result, 'manual');
    } catch (err) {
      console.error('[RevenueCat] presentPaywall error:', err);
      recordError(err, 'rc_present_paywall');
      Events.purchaseFailed({ product_id: 'unknown', reason: String((err as any)?.message ?? err) });
      return false;
    }
  }, [handlePaywallResult]);

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
      return await handlePaywallResult(result, 'gated');
    } catch (err) {
      console.error('[RevenueCat] presentPaywallIfNeeded error:', err);
      recordError(err, 'rc_present_paywall_if_needed');
      Events.purchaseFailed({ product_id: 'unknown', reason: String((err as any)?.message ?? err) });
      return false;
    }
  }, [handlePaywallResult]);

  const presentChatPackPaywall = useCallback(async (): Promise<{ purchased: true; quantity: number } | 'dismissed' | 'unavailable'> => {
    if (!REVENUECAT_ENABLED) return 'unavailable';
    try {
      const offerings = await getOfferings();
      const offering = offerings.all[CHAT_PACK_OFFERING_ID] ?? null;
      if (!offering) {
        console.warn('[RevenueCat] in-app-purchases offering not found');
        return 'unavailable';
      }
      Events.paywallViewed('manual');
      const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywall({ offering });
      if (result !== PAYWALL_RESULT.PURCHASED) return 'dismissed';

      // Resolve quantity from the most recent non-subscription transaction
      const info = await getCustomerInfo();
      setCustomerInfo(info);
      const recent = info.nonSubscriptionTransactions
        .slice()
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
      const quantity = (recent && CHAT_PACK_QUANTITIES[recent.productIdentifier]) ?? 1;
      Events.purchaseCompleted({ product_id: recent?.productIdentifier ?? 'unknown' });
      return { purchased: true, quantity };
    } catch (err) {
      console.error('[RevenueCat] presentChatPackPaywall error:', err);
      recordError(err, 'rc_chat_pack_paywall');
      return 'unavailable';
    }
  }, []);

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
      recordError(err, 'rc_customer_center');
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
        presentChatPackPaywall,
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
