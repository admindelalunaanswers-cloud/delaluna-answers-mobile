import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { NatalChart } from '@/src/services/astroEngine';
import type { SynastryReadingResult } from '@/src/types/synastry-reading.types';
import { buildSynastryPrompt } from '@/src/prompts/synastry-prompt';
import { ScoredAspect, selectTopAspects } from '@/src/utils/synastry';
import { calculateSynastry } from '@/src/services/astroEngine';

// The extension watches documents in users/{uid}/connections/{connectionId}/synastryReading/*
const READING_DOC = 'details';

// ─── Helpers ────────────────────────────────────────────────────────────────

function summarizeChart(chart: NatalChart) {
  return {
    planets: chart.planets.map(p => ({
      name: p.name,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      isRetrograde: p.isRetrograde,
    })),
    ascendant: { sign: chart.ascendant.sign, degree: chart.ascendant.degree },
    midheaven: { sign: chart.midheaven.sign, degree: chart.midheaven.degree },
  };
}

function summarizeAspects(scored: ScoredAspect[], nameA: string, nameB: string) {
  return scored.map(a => ({
    pair:   `${nameA}'s ${a.planet1} meeting ${nameB}'s ${a.planet2}`,
    aspect: a.type.toLowerCase(),
    orb:    Math.round(a.orb * 100) / 100,
    nature: a.nature,
  }));
}

/**
 * Build the JSON-serialized data block embedded in the prompt.
 * Includes both charts' key placements plus the top scored cross-chart aspects.
 */
function buildSynastryData(
  chartA: NatalChart,
  chartB: NatalChart,
  nameA: string,
  nameB: string,
): string {
  const rawAspects = calculateSynastry(chartA.planets, chartB.planets);
  const scored     = selectTopAspects(rawAspects);

  return JSON.stringify({
    [nameA]: summarizeChart(chartA),
    [nameB]: summarizeChart(chartB),
    topAspects: summarizeAspects(scored, nameA, nameB),
  });
}

function parseResult(data: Record<string, any>): SynastryReadingResult | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  try {
    const cleaned = typeof raw === 'string'
      ? raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      : raw;
    const parsed = typeof cleaned === 'string' ? JSON.parse(cleaned) : cleaned;
    if (
      typeof parsed?.loveLanguage === 'string' &&
      typeof parsed?.conflictStyle === 'string' &&
      typeof parsed?.longevity === 'string'
    ) {
      return parsed as SynastryReadingResult;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Public types ───────────────────────────────────────────────────────────

export interface SynastryReadingFetch {
  result:  SynastryReadingResult | null;
  pending: boolean;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** One-time read of the synastry reading document. */
export async function fetchSynastryReading(
  uid: string,
  connectionId: string,
): Promise<SynastryReadingFetch> {
  const snap = await getDoc(
    doc(db, 'users', uid, 'connections', connectionId, 'synastryReading', READING_DOC),
  );
  const result  = snap.exists() ? parseResult(snap.data()) : null;
  const pending = !result && snap.exists();
  return { result, pending };
}

/**
 * Writes the prompt to Firestore so the extension generates the reading.
 * Idempotent — merges into the existing doc so a re-request regenerates
 * in place rather than racing with an old response.
 */
export async function requestSynastryReading(
  uid: string,
  connectionId: string,
  chartA: NatalChart,
  chartB: NatalChart,
  nameA: string,
  nameB: string,
): Promise<void> {
  const synastryData = buildSynastryData(chartA, chartB, nameA, nameB);
  const prompt       = buildSynastryPrompt(nameA, nameB, synastryData);
  const requestedAt  = serverTimestamp();

  await setDoc(
    doc(db, 'users', uid, 'connections', connectionId, 'synastryReading', READING_DOC),
    { prompt, synastryData, nameA, nameB, requestedAt },
    { merge: true },
  );
}

/**
 * Real-time listener. Returns an unsubscribe function.
 */
export function subscribeToSynastryReading(
  uid: string,
  connectionId: string,
  onResult: (result: SynastryReadingResult) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'connections', connectionId, 'synastryReading', READING_DOC),
    (snap) => {
      if (!snap.exists()) return;
      const result = parseResult(snap.data());
      if (result) onResult(result);
    },
  );
}
