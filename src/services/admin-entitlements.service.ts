/**
 * admin-entitlements.service.ts
 * Admin-only tooling: search users by their Firebase UID (= RevenueCat App
 * User ID, see revenuecat.service.ts loginUser()) and grant/revoke
 * promotional RevenueCat entitlements for them.
 *
 * Search + read rely on firestore.rules' blanket admin override
 * (`isAdmin()` on `match /{document=**}`) — no Cloud Function needed for
 * those. Mutating entitlements requires RevenueCat's Secret API key, which
 * must never reach the client, so that goes through the `setEntitlementOverride`
 * Cloud Function instead.
 */

import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
} from "firebase/firestore";

import { db, functions } from "@/firebaseConfig";
import type { UserDoc } from "@/src/types/user.type";

export const OVERRIDABLE_ENTITLEMENT_IDS = [
  "Delaluna Answers Pro",
  "Pro-Trial",
] as const;
export type OverridableEntitlementId =
  (typeof OVERRIDABLE_ENTITLEMENT_IDS)[number];

export const PROMOTIONAL_DURATIONS = [
  "daily",
  "three_day",
  "weekly",
  "monthly",
  "two_month",
  "three_month",
  "six_month",
  "yearly",
  "lifetime",
] as const;
export type PromotionalDuration = (typeof PROMOTIONAL_DURATIONS)[number];

export interface UserSearchResult {
  uid: string;
  email: string;
  fullName: string;
  isPremiumMember: boolean;
}

/** Minimum prefix length before firing a search (UX guard, not a security boundary). */
const MIN_SEARCH_PREFIX_LENGTH = 5;

/**
 * Prefix-matches Firebase UIDs (= RC App User IDs) against `users/{uid}`
 * document IDs. Only usable by admins — the firestore.rules admin override
 * is what actually permits this collection read; non-admins get
 * `permission-denied` at the SDK level.
 */
export async function searchUsersByUidPrefix(
  prefix: string,
): Promise<UserSearchResult[]> {
  const trimmed = prefix.trim();
  if (trimmed.length < MIN_SEARCH_PREFIX_LENGTH) return [];

  const q = query(
    collection(db, "users"),
    orderBy(documentId()),
    startAt(trimmed),
    endAt(trimmed + ""),
    limit(10),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as UserDoc;
    return {
      uid: d.id,
      email: data.email ?? "",
      fullName: data.fullName ?? "",
      isPremiumMember: !!data.isPremiumMember,
    };
  });
}

export interface EntitlementMirrorInfo {
  expiresDate: string | null;
  productIdentifier: string;
  purchaseDate: string;
}

/**
 * Reads the RevenueCat Firebase Extension's purchaser-info mirror for one
 * user. Returns null if the user has no RC record yet (e.g. never opened
 * the app / no purchases).
 */
export async function getEntitlementMirror(
  uid: string,
): Promise<Record<string, EntitlementMirrorInfo> | null> {
  const snap = await getDoc(doc(db, "subscriptions/purchaser-info/customers", uid));
  const data = snap.data() as
    | { subscriber?: { entitlements?: Record<string, any> } }
    | { entitlements?: Record<string, any> }
    | undefined;
  const raw =
    (data as any)?.subscriber?.entitlements ?? (data as any)?.entitlements;
  if (!raw) return null;

  const result: Record<string, EntitlementMirrorInfo> = {};
  for (const [id, ent] of Object.entries(raw) as [string, any][]) {
    result[id] = {
      expiresDate: ent.expires_date ?? ent.expiresDate ?? null,
      productIdentifier: ent.product_identifier ?? ent.productIdentifier ?? "",
      purchaseDate: ent.purchase_date ?? ent.purchaseDate ?? "",
    };
  }
  return result;
}

interface SetEntitlementOverrideResponse {
  success: true;
  entitlements: Record<string, EntitlementMirrorInfo>;
}

/** Grants a promotional entitlement to `targetUid` for `duration`. Admin-gated server-side. */
export async function grantEntitlement(params: {
  targetUid: string;
  entitlementId: OverridableEntitlementId;
  duration: PromotionalDuration;
}): Promise<SetEntitlementOverrideResponse> {
  const fn = httpsCallable(functions, "setEntitlementOverride");
  const res = await fn({ action: "grant", ...params });
  return res.data as SetEntitlementOverrideResponse;
}

/** Revokes a previously-granted promotional entitlement from `targetUid`. Admin-gated server-side. */
export async function revokeEntitlement(params: {
  targetUid: string;
  entitlementId: OverridableEntitlementId;
}): Promise<SetEntitlementOverrideResponse> {
  const fn = httpsCallable(functions, "setEntitlementOverride");
  const res = await fn({ action: "revoke", ...params });
  return res.data as SetEntitlementOverrideResponse;
}
