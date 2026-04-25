/**
 * user-context.tsx
 * Listens to Firebase Auth state, fetches the Firestore user doc + purchases subcollection.
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, getDocs, Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import type { UserDoc, PurchaseDoc } from '@/src/types/user.type';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserContextValue {
  /** Firebase Auth user — null = signed out, undefined = loading */
  authUser:  User | null | undefined;
  /** Firestore users/{uid} document */
  userDoc:   UserDoc | null | undefined;
  /** users/{uid}/purchases subcollection */
  purchases: PurchaseDoc[];
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

  const userDocUnsubRef = useRef<Unsubscribe | null>(null);

  const subscribeToUserDoc = (uid: string) => {
    userDocUnsubRef.current?.();
    userDocUnsubRef.current = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const next = snap.exists() ? (snap.data() as UserDoc) : null;
        console.log('[UserContext] userDoc snapshot:', next);
        setUserDoc(next);
      },
      (err) => {
        console.error('[UserContext] userDoc snapshot error:', err);
        setUserDoc(null);
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
      console.error('[UserContext] refresh error:', err);
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
        try {
          setPurchases(await fetchPurchases(user.uid));
        } catch (err) {
          console.error('[UserContext] fetchPurchases error:', err);
          setPurchases([]);
        }
      } else {
        userDocUnsubRef.current?.();
        userDocUnsubRef.current = null;
        setUserDoc(null);
        setPurchases([]);
      }
      setLoading(false);
    });
    return () => {
      unsubscribe();
      userDocUnsubRef.current?.();
      userDocUnsubRef.current = null;
    };
  }, []);

  return (
    <UserContext.Provider value={{ authUser, userDoc, purchases, loading, refresh, reloadAuthUser }}>
      {children}
    </UserContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUser() {
  return useContext(UserContext);
}
