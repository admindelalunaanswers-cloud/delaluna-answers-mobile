/**
 * users.ts — Firestore reads for the Users section.
 *
 * Every read here relies on the admin catch-all in firestore.rules
 * (`match /{document=**} { allow read, write: if isAdmin(); }`), so no Cloud
 * Function is needed to look at data. Mutations are a different matter and go
 * through callables — see moderation.ts.
 */

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
  type Timestamp,
} from 'firebase/firestore';

import { db } from './firebase';

/** Mirrors src/types/user.type.ts — only the fields the dashboard reads. */
export interface AdminUserDoc {
  uid: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  pronouns?: string;
  isEmailVerified?: boolean;
  isPremiumMember?: boolean;
  isAdmin?: boolean;
  placeOfBirth?: string;
  birthday?: Timestamp;
  birthtime?: string;
  isBirthTimeUnknown?: boolean;
  timezoneOffsetMinutes?: number;
  createdAt?: Timestamp;
  lastLoggedInAt?: Timestamp;
  birthDetailsChangeCount?: number;
  // Moderation state is NOT here — it lives at `moderation/{uid}`, because this
  // document is delete-able by its owner. See lib/moderation.ts.
}

const MIN_PREFIX = 3;

/**
 * Prefix search over email, then UID. Firestore has no substring search, so
 * this is a range scan on an ordered field — "jea" matches "jeanai@…" but
 * "anai" matches nothing. The UI says so rather than looking broken.
 */
export async function searchUsers(term: string): Promise<AdminUserDoc[]> {
  const raw = term.trim();
  if (raw.length < MIN_PREFIX) return [];

  const users = collection(db, 'users');
  const byEmail = raw.toLowerCase();

  // U+F8FF, a private-use character that sorts above any ordinary one, so
  // [term, term + HIGH] spans exactly the strings starting with `term`. It is
  // declared here rather than inlined because it renders as an invisible glyph
  // in most editors — inlined, it reads as `endAt(x + '')`, which looks like a
  // no-op bug and invites someone to "fix" it into an exact-match query.
  const HIGH = '\uf8ff';

  const [emailSnap, uidSnap] = await Promise.all([
    getDocs(
      query(users, orderBy('email'), startAt(byEmail), endAt(byEmail + HIGH), limit(25)),
    ).catch(() => null),
    getDocs(
      query(users, orderBy(documentId()), startAt(raw), endAt(raw + HIGH), limit(25)),
    ).catch(() => null),
  ]);

  const merged = new Map<string, AdminUserDoc>();
  for (const snap of [emailSnap, uidSnap]) {
    snap?.forEach((d) => {
      if (!merged.has(d.id)) {
        merged.set(d.id, { ...(d.data() as AdminUserDoc), uid: d.id });
      }
    });
  }
  return [...merged.values()];
}

export async function getUser(uid: string): Promise<AdminUserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { ...(snap.data() as AdminUserDoc), uid: snap.id };
}

// ─── Subscription mirror ─────────────────────────────────────────────────────

export interface SubscriberInfo {
  entitlements: { id: string; expiresAt: string | null }[];
  nonSubscriptions: { productId: string; count: number }[];
  raw: unknown;
}

/**
 * Reads the RevenueCat mirror the extension maintains. Path depth matters:
 * the uid is the *fourth* segment, not the second.
 */
export async function getSubscriber(uid: string): Promise<SubscriberInfo | null> {
  const snap = await getDoc(
    doc(db, 'subscriptions', 'purchaser-info', 'customers', uid),
  );
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, any>;
  const subscriber = data?.subscriber ?? data;

  const entitlements = Object.entries(
    (subscriber?.entitlements ?? {}) as Record<string, any>,
  ).map(([id, v]) => ({ id, expiresAt: v?.expires_date ?? null }));

  const nonSubscriptions = Object.entries(
    (subscriber?.non_subscriptions ?? {}) as Record<string, any>,
  ).map(([productId, list]) => ({
    productId,
    count: Array.isArray(list) ? list.length : 0,
  }));

  return { entitlements, nonSubscriptions, raw: data };
}

// ─── Chat usage ledger ───────────────────────────────────────────────────────

/**
 * Mirrors chatUsageDayId() in src/services/chat.service.ts. The day id comes
 * from the user's stored timezone offset, not from whoever is looking at the
 * dashboard — read it with the browser's clock and you would be looking at a
 * different document than the server writes.
 */
export function chatUsageDayId(offsetMinutes?: number): string {
  const d =
    typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)
      ? new Date(Date.now() + offsetMinutes * 60 * 1000)
      : new Date();
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export interface ChatUsage {
  /** Absent means the account is not metered at all — not "used zero today". */
  hasLedger: boolean;
  today: number;
  creditsConsumed: number;
  dayId: string;
}

export async function getChatUsage(
  uid: string,
  offsetMinutes?: number,
): Promise<ChatUsage> {
  const dayId = chatUsageDayId(offsetMinutes);
  const [daySnap, creditSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'chatUsage', dayId)),
    getDoc(doc(db, 'users', uid, 'chatUsage', '_credits')),
  ]);
  return {
    hasLedger: daySnap.exists(),
    today: (daySnap.data()?.count as number) ?? 0,
    creditsConsumed: (creditSnap.data()?.consumed as number) ?? 0,
    dayId,
  };
}
