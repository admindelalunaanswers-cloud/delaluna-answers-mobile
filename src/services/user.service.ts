import { doc, setDoc, serverTimestamp, getDoc, collection, getDocs } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  onAuthStateChanged as fbOnAuthStateChanged,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, db } from '@/firebaseConfig';
import { FinalSignupPayload } from '@/src/types/signup.types';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { UserDoc } from '@/src/types/user.type';

/**
 * Returns true if the email is already registered in Firebase Auth.
 * Fails silently (returns false) on network errors so the UI never breaks.
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    return methods.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a new Firebase Auth user
 */
export async function signUp(email: string, password: string) {
  try {
    return await createUserWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    console.error('❌ Error in signUp:', error);
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
      console.warn(`⚠️ Invalid numeric value at '${path}' → replaced with null`);
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
      console.warn(`⚠️ Undefined value at '${fieldPath}' → removed`);
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
      await setDoc(userDocRef, {
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('❌ Error creating new user document:', error);
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
      isPremiumMember: true,
      isEmailVerified: false,
    });

    await setDoc(userDocRef, {
      ...sanitizedData,
      createdAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('❌ Error creating user document:', error);
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
    console.error('❌ Error in signIn:', error);
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
    console.error('❌ Error updating user document:', error);
    throw new Error('Error updating user document');
  }
}

/**
 * Update only birth-related fields and trigger backend recomputation pipeline.
 * Intended for use from Edit Profile when astro-dependent fields change.
 */
export async function updateUserBirthData(
  userId: string,
  payload: {
    birthday: string;
    birthtime: string | null;
    birthTimezone: number;
    birthLat: number;
    birthLon: number;
    placeOfBirth: string | null;
    isBirthTimeUnknown: boolean;
    isPlaceOfBirthUnknown: boolean;
  }
): Promise<void> {
  try {
    const userDocRef = getUserDocRef(userId);

    const sanitizedData = sanitizeFirestoreData({
      birthday: payload.birthday,
      birthtime: payload.birthtime ?? '12:00',
      birthTimezone: payload.birthTimezone ?? 0,
      birthLat: payload.birthLat,
      birthLon: payload.birthLon,
      placeOfBirth: payload.placeOfBirth ?? null,
      isBirthTimeUnknown: payload.isBirthTimeUnknown ?? false,
      isPlaceOfBirthUnknown: payload.isPlaceOfBirthUnknown ?? false,
      signupStatus: 'processing',
    });

    await setDoc(userDocRef, {
      ...sanitizedData,
      lastUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('❌ Error updating user birth data:', error);
    throw new Error('Error updating user birth data');
  }
}
