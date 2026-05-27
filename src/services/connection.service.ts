import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';

interface UserBirthPartial {
  firstName?: string;
  lastName?: string;
  pronouns?: string;
  birthday?: string;
  birthtime?: string | null;
  placeOfBirth?: string | null;
  birthLat?: number;
  birthLon?: number;
  birthTimezone?: number;
  isBirthTimeUnknown?: boolean;
  isPlaceOfBirthUnknown?: boolean;
}

/**
 * Batch-updates the firstPerson snapshot in every connection created with
 * "Use my chart" (isMe=true) to reflect the user's new birth details and
 * computed signs. Call this after a natal chart recalculation in edit-profile.
 *
 * Note: this updates the stored person data only; the existing compatibility
 * report is left in place and will reflect the new chart on next generation.
 */
export async function updateUserChartInConnections(
  uid: string,
  userData: UserBirthPartial,
  chartDetails: NatalChartDetailsDoc,
): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'connections'), where('isMe', '==', true)),
  );

  if (snap.empty) return;

  const sunSign    = chartDetails.planets.find(p => p.name === 'Sun')?.sign ?? '';
  const moonSign   = chartDetails.planets.find(p => p.name === 'Moon')?.sign ?? '';
  const risingSign = chartDetails.ascendant.sign ?? '';

  const batch = writeBatch(db);

  for (const docSnap of snap.docs) {
    batch.update(docSnap.ref, {
      'firstPerson.firstName':              userData.firstName ?? '',
      'firstPerson.lastName':               userData.lastName ?? '',
      'firstPerson.pronouns':               userData.pronouns ?? '',
      'firstPerson.sun':                    sunSign,
      'firstPerson.moon':                   moonSign,
      'firstPerson.rising':                 risingSign,
      'firstPerson.birthday':               userData.birthday ?? '',
      'firstPerson.birthLat':               userData.birthLat ?? null,
      'firstPerson.birthLon':               userData.birthLon ?? null,
      'firstPerson.birthTimezone':          userData.birthTimezone ?? null,
      'firstPerson.placeOfBirth':           userData.placeOfBirth ?? null,
      'firstPerson.isBirthTimeUnknown':     userData.isBirthTimeUnknown ?? false,
      'firstPerson.isPlaceOfBirthUnknown':  userData.isPlaceOfBirthUnknown ?? false,
    });
  }

  await batch.commit();
}
