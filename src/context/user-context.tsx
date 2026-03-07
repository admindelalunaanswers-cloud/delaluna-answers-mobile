/**
 * user-context.tsx
 * Listens to Firebase Auth state, fetches the Firestore user doc + purchases subcollection.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
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

async function fetchUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

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

  const loadAll = async (uid: string) => {
    try {
      const [uDoc, purcs] = await Promise.all([
        fetchUserDoc(uid),
        fetchPurchases(uid),
      ]);
      setUserDoc(uDoc);
      setPurchases(purcs);
    } catch {
      setUserDoc(null);
      setPurchases([]);
    }
  };

  const refresh = async () => {
    if (authUser?.uid) await loadAll(authUser.uid);
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
        await loadAll(user.uid);
      } else {
        setUserDoc(null);
        setPurchases([]);
      }
      setLoading(false);
    });
    return unsubscribe;
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
