/**
 * user-context.tsx
 * Listens to Firebase Auth state, fetches the Firestore user doc + purchases subcollection.
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, getDocs, Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/firebaseConfig';
import type { UserDoc, PurchaseDoc } from '@/src/types/user.type';
import { logger } from '@/src/utils/logger';
import type { ModerationDoc } from '@/src/constants/moderation';

/**
 * Reconciles the caller's `admin` custom claim against the server-side
 * email allowlist, then force-refreshes the ID token if the server says
 * something changed. Safe to call on every sign-in — the function is
 * idempotent and short-circuits when state already matches.
 */
async function syncAdminClaim(user: User): Promise<void> {
  try {
    const fn = httpsCallable<unknown, { admin: boolean; changed: boolean }>(
      functions,
      'syncAdminClaim',
    );
    const res = await fn({});
    if (res.data?.changed) {
      // Force a fresh token so the new claim is visible to security rules.
      await user.getIdToken(true);
    }
  } catch (err) {
    // Fail open — admin status is a privilege grant, not a gate. A failure
    // here just means non-admins stay non-admin until next sign-in.
    logger.warn('[UserContext] syncAdminClaim failed:', err);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserContextValue {
  /** Firebase Auth user — null = signed out, undefined = loading */
  authUser:  User | null | undefined;
  /** Firestore users/{uid} document */
  userDoc:   UserDoc | null | undefined;
  /** users/{uid}/purchases subcollection */
  purchases: PurchaseDoc[];
  /** moderation/{uid} — null means unmoderated, which is the normal case. */
  moderation: ModerationDoc | null;
  loading:   boolean;
  /** Re-fetch after profile or purchase update */
  refresh:   () => Promise<void>;
  /** Reload Firebase Auth user (e.g. after emailVerified changes) */
  reloadAuthUser: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue>({
  authUser:       undefined,
  userDoc:        undefined,
  purchases:      [],
  moderation:     null,
  loading:        true,
  refresh:        async () => {},
  reloadAuthUser: async () => {},
});

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchPurchases(uid: string): Promise<PurchaseDoc[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'purchases'));
  return snap.docs.map(d => d.data() as PurchaseDoc);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
  const [authUser,  setAuthUser]  = useState<User | null | undefined>(undefined);
  const [userDoc,   setUserDoc]   = useState<UserDoc | null | undefined>(undefined);
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
  const [loading,   setLoading]   = useState(true);
  // Per-account bans and feature blocks. Lives at `moderation/{uid}` rather
  // than on the user doc, which the owner can delete — see
  // src/constants/moderation.ts. Absent document = unmoderated, the norm.
  const [moderation, setModeration] = useState<ModerationDoc | null>(null);

  const userDocUnsubRef = useRef<Unsubscribe | null>(null);
  const moderationUnsubRef = useRef<Unsubscribe | null>(null);

  const subscribeToUserDoc = (uid: string) => {
    userDocUnsubRef.current?.();
    userDocUnsubRef.current = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const next = snap.exists() ? (snap.data() as UserDoc) : null;
        // The doc carries the user's name and birth details — log its
        // presence, never its contents.
        logger.debug('[UserContext] userDoc snapshot:', next ? 'present' : 'missing');
        setUserDoc(next);
      },
      (err) => {
        logger.error('[UserContext] userDoc snapshot failed', err, 'user_doc_snapshot');
        setUserDoc(null);
      },
    );
  };

  const subscribeToModeration = (uid: string) => {
    moderationUnsubRef.current?.();
    moderationUnsubRef.current = onSnapshot(
      doc(db, 'moderation', uid),
      (snap) => {
        setModeration(snap.exists() ? (snap.data() as ModerationDoc) : null);
      },
      (err) => {
        // Fail open on read errors. A transient snapshot failure must not
        // present as "your account is banned" — the server enforces the block
        // regardless of what this listener manages to read.
        logger.error('[UserContext] moderation snapshot failed', err, 'moderation_snapshot');
        setModeration(null);
      },
    );
  };

  const refresh = async () => {
    if (!authUser?.uid) return;
    try {
      const [snap, purcs] = await Promise.all([
        getDoc(doc(db, 'users', authUser.uid)),
        fetchPurchases(authUser.uid),
      ]);
      setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null);
      setPurchases(purcs);
    } catch (err) {
      logger.error('[UserContext] refresh failed', err, 'user_refresh');
    }
  };

  const reloadAuthUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setAuthUser({ ...auth.currentUser });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        subscribeToUserDoc(user.uid);
        subscribeToModeration(user.uid);
        // Fire-and-forget: reconcile the admin claim in the background so
        // the user-doc snapshot doesn't have to wait on a callable round-trip.
        void syncAdminClaim(user);
        try {
          setPurchases(await fetchPurchases(user.uid));
        } catch (err) {
          logger.error('[UserContext] fetchPurchases failed', err, 'user_fetch_purchases');
          setPurchases([]);
        }
      } else {
        userDocUnsubRef.current?.();
        userDocUnsubRef.current = null;
        moderationUnsubRef.current?.();
        moderationUnsubRef.current = null;
        setUserDoc(null);
        setModeration(null);
        setPurchases([]);
      }
      setLoading(false);
    });
    return () => {
      unsubscribe();
      userDocUnsubRef.current?.();
      userDocUnsubRef.current = null;
      moderationUnsubRef.current?.();
      moderationUnsubRef.current = null;
    };
  }, []);

  return (
    <UserContext.Provider value={{ authUser, userDoc, purchases, moderation, loading, refresh, reloadAuthUser }}>
      {children}
    </UserContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUser() {
  return useContext(UserContext);
}
