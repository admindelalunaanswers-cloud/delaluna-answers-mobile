import { doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

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
    const stripped = typeof raw === 'string'
      ? raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      : raw;
    // Hermes (React Native) is stricter than V8 — trailing commas before } or ]
    // are invalid JSON but the AI occasionally emits them. Strip them before parsing.
    const parsed: NatalChartBreakdownResult = typeof stripped !== 'string'
      ? stripped
      : JSON.parse(stripped.replace(/,(\s*[}\]])/g, '$1'));
    // Reject empty or structurally incomplete responses (e.g. {} written by
    // the Extension on error). An empty object is truthy and would otherwise
    // be accepted, causing the birth chart view to render blank content.
    if (!parsed || !Array.isArray(parsed.houses) || parsed.houses.length === 0) return null;
    return parsed;
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
  const docRef = doc(db, 'users', uid, 'natalChart', BREAKDOWN_DOC);

  // Delete before writing so the Extension's onDocumentCreated trigger always fires.
  // Using setDoc on an existing document only fires onDocumentWritten — if the
  // Extension uses onCreate (the most common AI-generation pattern), it would
  // silently skip the re-request and leave the breakdown permanently stuck.
  // deleteDoc on a non-existent document is a safe no-op, so this works for
  // both new users (first generation) and existing users (profile updates).
  await deleteDoc(docRef);

  const natalChart  = buildNatalChartSummary(chart);
  const prompt      = buildNatalChartPrompt(natalChart, pronouns);

  await setDoc(docRef, { prompt, natalChart, requestedAt: serverTimestamp() });
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
