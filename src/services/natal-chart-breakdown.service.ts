import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { buildNatalChartPrompt } from '@/src/prompts/natal-chart-prompt';

// The extension watches documents in users/{uid}/natalChart/*
const BREAKDOWN_DOC = 'details';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildNatalChartSummary(chart: NatalChartDetailsDoc): string {
  return JSON.stringify({
    planets: chart.planets.map(p => ({
      name: p.name,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      isRetrograde: p.isRetrograde,
    })),
    houses: chart.houses.cusps.slice(1).map((cusp, i) => ({
      house: i + 1,
      cusp: Math.round(cusp),
    })),
    ascendant: { sign: chart.ascendant.sign, degree: chart.ascendant.degree },
    midheaven: { sign: chart.midheaven.sign, degree: chart.midheaven.degree },
  });
}

function parseResult(data: Record<string, any>): NatalChartBreakdownResult | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  try {
    const cleaned = typeof raw === 'string'
      ? raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      : raw;
    return typeof cleaned === 'string'
      ? JSON.parse(cleaned)
      : (cleaned as NatalChartBreakdownResult);
  } catch {
    return null;
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BreakdownFetchResult {
  result: NatalChartBreakdownResult | null;
  pending: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** One-time read of the breakdown document. */
export async function fetchBreakdown(uid: string): Promise<BreakdownFetchResult> {
  const snap = await getDoc(doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC));
  const result = snap.exists() ? parseResult(snap.data()) : null;
  const pending = !result && snap.exists();
  return { result, pending };
}

/**
 * Writes the prompt to Firestore so the extension generates the breakdown.
 */
export async function requestBreakdown(
  uid: string,
  chart: NatalChartDetailsDoc,
  pronouns = 'they/them',
): Promise<void> {
  const natalChart  = buildNatalChartSummary(chart);
  const prompt      = buildNatalChartPrompt(natalChart, pronouns);
  const requestedAt = serverTimestamp();

  await setDoc(
    doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC),
    { prompt, natalChart, requestedAt },
  );
}

/**
 * Real-time listener for the breakdown document.
 * Returns an unsubscribe function.
 */
export function subscribeToBreakdown(
  uid: string,
  onResult: (result: NatalChartBreakdownResult) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC),
    (snap) => {
      if (!snap.exists()) return;
      const result = parseResult(snap.data());
      if (result) onResult(result);
    },
  );
}
