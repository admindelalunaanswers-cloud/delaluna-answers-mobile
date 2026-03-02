import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { TransitReadingResult } from '@/src/types/transit-reading.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import type { TransitData } from '@/src/services/astroEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTodayDateId(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateId: string): string {
  const [y, m, d] = dateId.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildNatalChartSummary(chart: NatalChartDetailsDoc): string {
  return JSON.stringify({
    planets: chart.planets.map(p => ({
      name: p.name,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      isRetrograde: p.isRetrograde,
    })),
    ascendant: { sign: chart.ascendant.sign, degree: chart.ascendant.degree },
    midheaven: { sign: chart.midheaven.sign, degree: chart.midheaven.degree },
  });
}

function buildTransitsSummary(transits: TransitData): string {
  return JSON.stringify({
    date: transits.date.toISOString(),
    moon: {
      sign: transits.moon.sign,
      phase: transits.moon.phase,
      illumination: transits.moon.illumination,
      degree: transits.moon.degree,
    },
    planets: transits.planets.map(p => ({
      name: p.name,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      isRetrograde: p.isRetrograde,
    })),
  });
}

function parseResult(data: Record<string, any>): TransitReadingResult | null {
  const raw = data?.result ?? data?.output;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as TransitReadingResult);
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TransitFetchResult {
  result: TransitReadingResult | null;
  /** true when the document exists but generation hasn't completed yet */
  pending: boolean;
}

/** One-time read of a transit reading document. */
export async function fetchTransitReading(
  uid: string,
  dateId: string,
): Promise<TransitFetchResult> {
  const snap = await getDoc(doc(db, 'users', uid, 'transits', dateId));
  if (!snap.exists()) return { result: null, pending: false };
  const data = snap.data();
  if (data?.status?.state === 'complete') {
    return { result: parseResult(data), pending: false };
  }
  return { result: null, pending: true };
}

/**
 * Write the Handlebars variable fields to users/{uid}/transits/{dateId}.
 * The extension renders the configured template server-side.
 */
export async function requestTransitReading(
  uid: string,
  dateId: string,
  chart: NatalChartDetailsDoc,
  transits: TransitData,
  tier: 'free' | 'premium',
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'transits', dateId), {
    natalChart: buildNatalChartSummary(chart),
    currentTransits: buildTransitsSummary(transits),
    date: formatDateLabel(dateId),
    tier,
    requestedAt: serverTimestamp(),
  });
}

/**
 * Real-time listener that resolves once the extension marks the document
 * complete. Returns an unsubscribe function.
 */
export function subscribeToTransitReading(
  uid: string,
  dateId: string,
  onResult: (result: TransitReadingResult) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'transits', dateId),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.status?.state !== 'complete') return;
      const result = parseResult(data);
      if (result) onResult(result);
    },
  );
}
