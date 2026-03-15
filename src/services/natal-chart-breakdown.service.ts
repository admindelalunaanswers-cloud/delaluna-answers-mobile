import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { buildFreeNatalChartPrompt, buildPremiumNatalChartPrompt } from '@/src/prompts/natal-chart-prompt';

// The extension watches documents in users/{uid}/natalChart/*
const FREE_DOC    = 'free';
const PREMIUM_DOC = 'premium';

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
  premiumResult: NatalChartBreakdownResult | null;
  pending: boolean;
  premiumPending: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** One-time read of both breakdown documents. */
export async function fetchBreakdown(uid: string): Promise<BreakdownFetchResult> {
  const [freeSnap, premiumSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'natalChart', FREE_DOC)),
    getDoc(doc(db, 'users', uid, 'natalChart', PREMIUM_DOC)),
  ]);

  const result        = freeSnap.exists()    ? parseResult(freeSnap.data())    : null;
  const premiumResult = premiumSnap.exists() ? parseResult(premiumSnap.data()) : null;

  const pending        = !result        && freeSnap.exists();
  const premiumPending = !premiumResult && premiumSnap.exists();

  return { result, premiumResult, pending, premiumPending };
}

/**
 * Writes both free and premium prompts to Firestore so the extension
 * generates both breakdowns simultaneously.
 */
export async function requestBreakdown(
  uid: string,
  chart: NatalChartDetailsDoc,
  pronouns = 'they/them',
): Promise<void> {
  const natalChart    = buildNatalChartSummary(chart);
  const freePrompt    = buildFreeNatalChartPrompt(natalChart, pronouns);
  const premiumPrompt = buildPremiumNatalChartPrompt(natalChart, pronouns);
  const requestedAt   = serverTimestamp();

  await Promise.all([
    setDoc(
      doc(db, 'users', uid, 'natalChart', FREE_DOC),
      { natalChart, tier: 'free', requestedAt },
      { merge: true },
    ),
    setDoc(
      doc(db, 'users', uid, 'natalChart', PREMIUM_DOC),
      { natalChart, tier: 'premium', requestedAt },
      { merge: true },
    ),
  ]);
}

/**
 * Real-time listener for both free and premium breakdowns.
 * Returns an unsubscribe function that clears both listeners.
 */
export function subscribeToBreakdown(
  uid: string,
  onFreeResult: (result: NatalChartBreakdownResult) => void,
  onPremiumResult: (result: NatalChartBreakdownResult) => void,
): () => void {
  const unsubFree = onSnapshot(
    doc(db, 'users', uid, 'natalChart', FREE_DOC),
    (snap) => {
      if (!snap.exists()) return;
      const result = parseResult(snap.data());
      if (result) onFreeResult(result);
    },
  );

  const unsubPremium = onSnapshot(
    doc(db, 'users', uid, 'natalChart', PREMIUM_DOC),
    (snap) => {
      if (!snap.exists()) return;
      const result = parseResult(snap.data());
      if (result) onPremiumResult(result);
    },
  );

  return () => {
    unsubFree();
    unsubPremium();
  };
}
