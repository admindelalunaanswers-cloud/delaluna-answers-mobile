import { doc, setDoc, serverTimestamp, getDoc, collection, getDocs } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged as fbOnAuthStateChanged,
  signOut as fbSignOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/firebaseConfig';
import { FinalSignupPayload } from '@/src/types/signup.types';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { UserDoc } from '@/src/types/user.type';
import { logger } from '@/src/utils/logger';

/**
 * Revoke all refresh tokens for the current user. Best-effort — failures are
 * swallowed because the caller is on a credential-change path and we still
 * want to complete the local action (signOut, password change, deletion).
 */
export async function revokeMyRefreshTokens(): Promise<void> {
  try {
    await httpsCallable(functions, 'revokeMyRefreshTokens')({});
  } catch (err) {
    logger.warn('[user.service] revokeMyRefreshTokens failed:', err);
  }
}

/**
 * Create a new Firebase Auth user
 */
export async function signUp(email: string, password: string) {
  try {
    return await createUserWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    logger.error('[user.service] signUp failed', error, 'user_sign_up');
    throw error; // preserve original Firebase error so callers can read error.code
  }
}

/**
 * Sanitize Firestore data recursively.
 * Cleans NaN, Infinity, undefined, and invalid nested values.
 * Also logs warnings to help trace invalid data sources.
 */
function sanitizeFirestoreData(obj: any, path: string = ''): any {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Date) return obj;

  // Preserve Firestore FieldValue sentinels (serverTimestamp, increment, etc.)
  // These are objects with a `_methodName` marker — iterating their keys would
  // strip the sentinel and save it as a literal map.
  if (typeof obj === 'object' && '_methodName' in obj) return obj;

  // Numbers
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      logger.warn(`⚠️ Invalid numeric value at '${path}' → replaced with null`);
      return null;
    }
    return obj;
  }

  // Non-objects (string, boolean, etc.)
  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.trim() === '') {
      return null;
    }
    return obj;
  }

  // Arrays
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => sanitizeFirestoreData(item, `${path}[${idx}]`))
              .filter((v) => v !== undefined);
  }

  // Objects
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = path ? `${path}.${key}` : key;

    if (value === undefined) {
      logger.warn(`⚠️ Undefined value at '${fieldPath}' → removed`);
      continue;
    }

    const sanitized = sanitizeFirestoreData(value, fieldPath);

    if (sanitized !== undefined) clean[key] = sanitized;
  }
  return clean;
}

/**
 * Create blank new userDoc
 */
export async function createNewUserDoc(userId: string): Promise<void> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
      const email = auth.currentUser?.email?.toLowerCase() ?? '';
      await setDoc(userDocRef, {
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        ...(email ? { email } : {}),
      });
    }
  } catch (error) {
    logger.error('[user.service] create new user document failed', error, 'user_doc_create_new');
    throw new Error('Error creating new user document');
  }
}

/**
 * Create new user document in Firestore
 */
export async function createUserDoc(userId: string, userData: FinalSignupPayload): Promise<void> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const email = userData.email?.toLowerCase() ?? '';
    const sanitizedData = sanitizeFirestoreData({
      ...userData,
      ...(userData.email ? { email } : {}),
      isPremiumMember: false,
      isEmailVerified: false,
    });

    await setDoc(userDocRef, {
      ...sanitizedData,
      createdAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    logger.error('[user.service] create user document failed', error, 'user_doc_create');
    throw new Error('Error creating user document');
  }
}

/**
 * Sign in existing user
 */
export async function signIn(email: string, password: string) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    logger.error('[user.service] signIn failed', error, 'user_sign_in');
    throw new Error(error.message || 'Auth error');
  }
}

/**
 * Sign out user
 */
export function signOut() {
  return fbSignOut(auth);
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChanged(cb: any) {
  return fbOnAuthStateChanged(auth, cb);
}

/**
 * Get Firestore reference for a user
 */
export function getUserDocRef(userId: string) {
  return doc(db, 'users', userId);
}

/**
 * Get User Horoscope Collection (by date)
 * Returns a map keyed by YYYY-MM-DD
 */
export async function getUserHoroscopes(
  userID: string
): Promise<Record<string, HoroscopeResult>> {
  const colRef = collection(db, 'users', userID, 'horoscope');
  const snap = await getDocs(colRef);

  const results: Record<string, HoroscopeResult> = {};

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    if (data?.status?.state === 'complete' && data?.result) {
      results[docSnap.id] = data.result as HoroscopeResult;
    }
  });

  return results;
}

/**
 * Safely update Firestore user document
 */
export async function updateUserDoc(userId: string, userData: Partial<UserDoc>): Promise<void> {
  try {
    const userDocRef = getUserDocRef(userId);
    const normalizedEmail = userData.email ? userData.email.toLowerCase() : undefined;
    const sanitizedData = sanitizeFirestoreData({
      ...userData,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
    });

    await setDoc(userDocRef, {
      ...sanitizedData,
      lastUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    logger.error('[user.service] update user document failed', error, 'user_doc_update');
    throw new Error('Error updating user document');
  }
}

