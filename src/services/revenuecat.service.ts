/**
 * revenuecat.service.ts
 * Handles RevenueCat SDK configuration, user identification,
 * entitlement checking, purchases, and subscription management.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from "react-native-purchases";

import { logger } from "@/src/utils/logger";

// ─── Constants ────────────────────────────────────────────────────────────────

/** RevenueCat public SDK key — test key for dev, platform-specific production key from EAS env */
const API_KEY = __DEV__
  ? ((Constants.expoConfig?.extra?.REVENUECAT_TST_API_KEY as string) ?? "")
  : (Platform.select({
      ios: Constants.expoConfig?.extra?.REVENUECAT_AAS_API_KEY as string,
      android: Constants.expoConfig?.extra?.REVENUECAT_GPS_API_KEY as string,
    }) ?? "");

export const REVENUECAT_ENABLED = true;

/** The entitlement identifier configured in RevenueCat dashboard */
export const ENTITLEMENT_ID = "Delaluna Answers Pro";

/** Offering identifier for the free-trial paywall (shown to first-time users) */
export const FREE_TRIAL_OFFERING_ID = "sale";

/** Entitlement identifier for the free-trial offering */
export const FREE_TRIAL_ENTITLEMENT_ID = "Pro-Trial";

/** Offering identifier for the chat-pack IAP paywall */
export const CHAT_PACK_OFFERING_ID = "in-app-purchases";

/** Product identifiers configured in RevenueCat dashboard */
export const PRODUCT_IDS = {
  weekly: "delaluna.sub.weekly",
  monthly: "delaluna.sub.monthly",
  chatPack1: "delaluna.iap.chat_pack_1",
  chatPack3: "delaluna.iap.chat_pack_3",
  chatPack5: "delaluna.iap.chat_pack_5",
  chatPack10: "delaluna.iap.chat_pack_10",
} as const;

/** Maps each chat-pack product ID to the number of questions it grants */
export const CHAT_PACK_QUANTITIES: Record<string, number> = {
  [PRODUCT_IDS.chatPack1]: 1,
  [PRODUCT_IDS.chatPack3]: 3,
  [PRODUCT_IDS.chatPack5]: 5,
  [PRODUCT_IDS.chatPack10]: 10,
};

/**
 * Counts the chat-pack questions this customer has ever bought.
 *
 * Mirrors `purchasedChatCredits()` in functions/src/index.ts, which reads the
 * same purchases from the RevenueCat extension's Firestore mirror
 * (`subscriber.non_subscriptions`). The server is the authority on what may be
 * spent; this exists so the in-app counter can show the same balance without
 * waiting for the webhook that populates the mirror. Both count one entry per
 * purchase, so a product bought twice grants twice.
 */
export function purchasedChatCredits(customerInfo: CustomerInfo): number {
  return customerInfo.nonSubscriptionTransactions.reduce(
    (total, tx) => total + (CHAT_PACK_QUANTITIES[tx.productIdentifier] ?? 0),
    0,
  );
}

// ─── Initialization ──────────────────────────────────────────────────────────

let _configured = false;

/**
 * Configure the RevenueCat SDK. Call once at app startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * Returns `true` if the SDK was actually initialised (or was already
 * initialised on a prior call), `false` if it was skipped (disabled or
 * missing API key). Callers that need to call into the SDK (e.g. `logIn`,
 * `getCustomerInfo`) must check this return value before proceeding.
 */
export function configureRevenueCat(): boolean {
  if (_configured) return !!API_KEY && REVENUECAT_ENABLED;

  if (!REVENUECAT_ENABLED) {
    _configured = true;
    logger.warn("[RevenueCat] disabled — skipping SDK configuration");
    return false;
  }

  if (!API_KEY) {
    _configured = true; // prevent repeated warn-and-bail on every re-render
    logger.warn("[RevenueCat] no API key found — skipping configuration");
    return false;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey: API_KEY });
  _configured = true;
  logger.debug("[RevenueCat] SDK configured");
  return true;
}

// ─── User identification ─────────────────────────────────────────────────────

/**
 * Link the current RevenueCat anonymous user to a Firebase Auth UID.
 * Returns the updated CustomerInfo and whether a new customer was created.
 */
export async function loginUser(
  firebaseUid: string,
): Promise<{ customerInfo: CustomerInfo; created: boolean }> {
  const { customerInfo, created } = await Purchases.logIn(firebaseUid);
  // The Firebase UID identifies the user — log only the outcome.
  logger.debug("[RevenueCat] logIn complete, created:", created);
  return { customerInfo, created };
}

/**
 * Reset to an anonymous RevenueCat user on sign-out.
 */
export async function logoutUser(): Promise<CustomerInfo> {
  const isAnonymous = await Purchases.isAnonymous();
  if (isAnonymous) {
    logger.debug("[RevenueCat] logOut skipped — already anonymous");
    return Purchases.getCustomerInfo();
  }
  const customerInfo = await Purchases.logOut();
  logger.debug("[RevenueCat] logOut — reset to anonymous");
  return customerInfo;
}

// ─── Customer info & entitlements ────────────────────────────────────────────

/**
 * Fetch the latest CustomerInfo from RevenueCat.
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * Check whether the user has active access to a given entitlement.
 * Defaults to checking the "Delaluna Answers Pro" entitlement.
 */
export function hasEntitlement(
  customerInfo: CustomerInfo,
  entitlementId: string = ENTITLEMENT_ID,
): boolean {
  return customerInfo.entitlements.active[entitlementId]?.isActive === true;
}

/**
 * Convenience: fetch customer info and check entitlement in one call.
 */
export async function checkProAccess(): Promise<boolean> {
  const info = await getCustomerInfo();
  return hasEntitlement(info);
}

/**
 * Returns true if the user has ever held the given entitlement (active or expired).
 * Use this to distinguish brand-new subscribers from returning/lapsed ones.
 */
export function hasEverHeldEntitlement(
  customerInfo: CustomerInfo,
  entitlementId: string = ENTITLEMENT_ID,
): boolean {
  return entitlementId in customerInfo.entitlements.all;
}

/**
 * Convenience: fetch customer info and return both current access status and
 * whether the user has ever subscribed (even if now expired or cancelled).
 */
export async function getSubscriptionHistory(): Promise<{
  isActive: boolean;
  hasEverSubscribed: boolean;
}> {
  const info = await getCustomerInfo();
  return {
    isActive: hasEntitlement(info),
    hasEverSubscribed: hasEverHeldEntitlement(info),
  };
}

/**
 * Returns the offering ID and required entitlement ID to use when presenting
 * the subscription paywall, based on whether the user has ever subscribed.
 *
 * - First-time users  → sale (free-trial-paywall) / Pro-Trial
 * - Returning users   → default (Branded Paywall) / Delaluna Answers Pro
 */
export function resolvePaywallOffering(customerInfo: CustomerInfo): {
  offeringId: string;
  entitlementId: string;
} {
  if (hasEverHeldEntitlement(customerInfo)) {
    return { offeringId: "default", entitlementId: ENTITLEMENT_ID };
  }
  return {
    offeringId: FREE_TRIAL_OFFERING_ID,
    entitlementId: FREE_TRIAL_ENTITLEMENT_ID,
  };
}

// ─── Offerings & products ────────────────────────────────────────────────────

/**
 * Fetch all offerings configured in RevenueCat.
 */
export async function getOfferings(): Promise<PurchasesOfferings> {
  return Purchases.getOfferings();
}

/**
 * Get the current (default) offering's available packages.
 * Returns an empty array if no offering is configured.
 */
export async function getCurrentPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

// ─── Purchasing ──────────────────────────────────────────────────────────────

/**
 * Purchase a store product directly.
 */
export async function purchaseProduct(
  product: PurchasesStoreProduct,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchaseStoreProduct(product);
  logger.debug("[RevenueCat] purchaseProduct complete:", product.identifier);
  return customerInfo;
}

// ─── Restore purchases ──────────────────────────────────────────────────────

/**
 * Restore purchases — useful when a user reinstalls or switches device.
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  const customerInfo = await Purchases.restorePurchases();
  logger.debug("[RevenueCat] restorePurchases complete");
  return customerInfo;
}

// ─── Listener ────────────────────────────────────────────────────────────────

/**
 * Subscribe to real-time CustomerInfo updates (e.g. renewal, expiry).
 * Returns an unsubscribe function.
 */
export function onCustomerInfoUpdate(
  listener: (info: CustomerInfo) => void,
): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);
  // The SDK doesn't return an unsubscribe handle, but calling
  // removeCustomerInfoUpdateListener is the counterpart.
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
