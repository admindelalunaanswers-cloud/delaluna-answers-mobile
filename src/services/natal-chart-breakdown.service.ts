import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { NATAL_CHART_PROMPT_TEMPLATE } from '@/src/prompts/natal-chart-prompt';

// The extension watches users/{uid}/natalChart/details
const BREAKDOWN_DOC = 'details';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNatalChartSummary(chart: NatalChartDetailsDoc): string {
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

function renderPrompt(vars: { tier: string; natalChart: string }): string {
  return NATAL_CHART_PROMPT_TEMPLATE
    .replace('{{tier}}', vars.tier)
    .replace('{{natalChart}}', vars.natalChart);
}

function parseResult(data: Record<string, any>): NatalChartBreakdownResult | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as NatalChartBreakdownResult);
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BreakdownFetchResult {
  result: NatalChartBreakdownResult | null;
  /** true when the document exists but generation hasn't completed yet */
  pending: boolean;
}

/** One-time read of the breakdown document. */
export async function fetchBreakdown(uid: string): Promise<BreakdownFetchResult> {
  const snap = await getDoc(doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC));
  if (!snap.exists()) return { result: null, pending: false };
  const data = snap.data();
  if (data?.status?.state === 'complete') {
    return { result: parseResult(data), pending: false };
  }
  return { result: null, pending: true };
}

/**
 * Merges prompt + tier into users/{uid}/natalChart/details.
 * Uses merge so the raw chart fields written during sign-up are preserved.
 */
export async function requestBreakdown(
  uid: string,
  chart: NatalChartDetailsDoc,
  tier: 'free' | 'premium',
): Promise<void> {
  const natalChart = buildNatalChartSummary(chart);
  const prompt = renderPrompt({ tier, natalChart });

  await setDoc(
    doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC),
    { prompt, tier, natalChart, requestedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Real-time listener that resolves once the extension marks the document
 * complete. Returns an unsubscribe function.
 */
export function subscribeToBreakdown(
  uid: string,
  onResult: (result: NatalChartBreakdownResult) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.status?.state !== 'complete') return;
      const result = parseResult(data);
      if (result) onResult(result);
    },
  );
}
