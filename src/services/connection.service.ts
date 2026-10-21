import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';

import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/firebaseConfig';
import { Events } from '@/src/services/analytics.service';
import { ConnectionsCache } from '@/src/services/connections-cache.service';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { calculateNatalChart, type NatalChart } from '@/src/services/astroEngine';
import { requestSynastryReading } from '@/src/services/synastry-reading.service';

const FALLBACK_LAT = 51.4779;
const FALLBACK_LON = 0.0015;

function parseBirthday(raw: string): { year: number; month: number; day: number } | null {
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return { month: Number(slash[1]), day: Number(slash[2]), year: Number(slash[3]) };
  const dash = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dash) return { year: Number(dash[1]), month: Number(dash[2]), day: Number(dash[3]) };
  return null;
}

function parseBirthTime(raw: string): [number, number] {
  const ampm = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = Number(ampm[2]);
    const period = ampm[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return [h, min];
  }
  const parts = raw.split(':');
  return [Number(parts[0]) || 0, Number(parts[1]) || 0];
}

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

/**
 * After a birth chart recalculation, regenerates any previously generated
 * synastry readings for connections where the user used their own chart.
 * The second person's chart is recalculated on-device from stored birth params.
 * Fire-and-forget — call without await and catch at the call site.
 */
export async function refreshSynastryReadingsForUser(
  uid: string,
  userChart: NatalChart,
  userName: string,
): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'connections'), where('isMe', '==', true)),
  );

  if (snap.empty) return;

  await Promise.allSettled(snap.docs.map(async (connectionSnap) => {
    const data = connectionSnap.data() as any;
    const connectionId = connectionSnap.id;
    const sp = data.secondPerson;
    if (!sp) return;

    // Only regenerate where a reading has already been requested or generated.
    const readingSnap = await getDoc(
      doc(db, 'users', uid, 'connections', connectionId, 'synastryReading', 'details'),
    );
    if (!readingSnap.exists()) return;

    const birthday = parseBirthday(sp.birthday ?? '');
    if (!birthday) return;

    const isTimeUnknown = sp.isBirthTimeUnknown ?? false;
    const [hour, minute] = isTimeUnknown ? [12, 0] : parseBirthTime(sp.timeOfBirth ?? '12:00');

    const isPlaceUnknown = sp.isPlaceOfBirthUnknown ?? false;
    const lat      = isPlaceUnknown ? FALLBACK_LAT : (sp.birthLat ?? FALLBACK_LAT);
    const lon      = isPlaceUnknown ? FALLBACK_LON : (sp.birthLon ?? FALLBACK_LON);
    const timezone = isPlaceUnknown ? 0             : (sp.birthTimezone ?? 0);

    const secondChart = await calculateNatalChart({
      year: birthday.year, month: birthday.month, day: birthday.day,
      hour, minute, lat, lon, timezone,
    });

    const nameB = sp.firstName ?? 'Partner';
    await requestSynastryReading(uid, connectionId, userChart, secondChart, userName, nameB);
  }));
}

/**
 * Deletes a connection the one supported way: through the `deleteConnection`
 * Cloud Function, then out of the local cache, then counted.
 *
 * The Connections list and the Edit Connection screen used to do this
 * separately, and the edit screen called `deleteDoc` directly — skipping the
 * cache (so the deleted connection could reappear in the list until the next
 * snapshot) and the analytics event. Both go through here now.
 *
 * Throws if the function call fails; the cache and the event are only touched
 * once it has succeeded.
 */
export async function deleteConnection(uid: string, connectionId: string): Promise<void> {
  await httpsCallable(functions, 'deleteConnection')({ userId: uid, connectionId });
  await ConnectionsCache.remove(uid, connectionId);
  Events.connectionDeleted();
}
