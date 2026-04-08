/**
 * revenuecat.service.ts
 * Handles RevenueCat SDK configuration, user identification,
 * entitlement checking, purchases, and subscription management.
 */

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Master switch for RevenueCat integration.
 * Set to `false` while we don't have a production API key — all SDK calls
 * become no-ops and `isPro` defaults to `true` so premium features stay
 * unlocked for testing builds.
 */
export const REVENUECAT_ENABLED = false;

/** RevenueCat public SDK key (same key for both platforms during testing) */
const API_KEY = 'test_HdGTsVRVGbHGXFBydudQTRISayC';

/** The entitlement identifier configured in RevenueCat dashboard */
export const ENTITLEMENT_ID = 'Delaluna Answers Pro';

/** Product identifiers configured in RevenueCat dashboard */
export const PRODUCT_IDS = {
  monthly: 'monthly',
  yearly: 'yearly',
  consumable: 'consumable',
} as const;

// ─── Initialization ──────────────────────────────────────────────────────────

let _configured = false;

/**
 * Configure the RevenueCat SDK. Call once at app startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function configureRevenueCat(): void {
  if (_configured) return;

  if (!REVENUECAT_ENABLED) {
    _configured = true;
    console.log('[RevenueCat] disabled — skipping SDK configuration');
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey: API_KEY });
  _configured = true;
  console.log('[RevenueCat] SDK configured');
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
  console.log('[RevenueCat] logIn:', firebaseUid, 'created:', created);
  return { customerInfo, created };
}

/**
 * Reset to an anonymous RevenueCat user on sign-out.
 */
export async function logoutUser(): Promise<CustomerInfo> {
  const isAnonymous = await Purchases.isAnonymous();
  if (isAnonymous) {
    console.log('[RevenueCat] logOut skipped — already anonymous');
    return Purchases.getCustomerInfo();
  }
  const customerInfo = await Purchases.logOut();
  console.log('[RevenueCat] logOut — reset to anonymous');
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
  return typeof customerInfo.entitlements.active[entitlementId] !== 'undefined';
}

/**
 * Convenience: fetch customer info and check entitlement in one call.
 */
export async function checkProAccess(): Promise<boolean> {
  const info = await getCustomerInfo();
  return hasEntitlement(info);
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
 * Purchase a specific package from an offering.
 * Returns the updated CustomerInfo after purchase.
 * Throws on error (caller should check `e.userCancelled`).
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  console.log('[RevenueCat] purchasePackage complete:', pkg.identifier);
  return customerInfo;
}

/**
 * Purchase a store product directly.
 */
export async function purchaseProduct(
  product: PurchasesStoreProduct,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchaseStoreProduct(product);
  console.log('[RevenueCat] purchaseProduct complete:', product.identifier);
  return customerInfo;
}

// ─── Restore purchases ──────────────────────────────────────────────────────

/**
 * Restore purchases — useful when a user reinstalls or switches device.
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  const customerInfo = await Purchases.restorePurchases();
  console.log('[RevenueCat] restorePurchases complete');
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
