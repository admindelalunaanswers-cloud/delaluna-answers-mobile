import { doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { logger } from '@/src/utils/logger';
import { logGenerationModel } from '@/src/utils/generation-model';

import { db } from '@/firebaseConfig';
import type { TransitReadingResult } from '@/src/types/transit-reading.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import type { TransitData } from '@/src/services/astroEngine';
import { TRANSITS_PROMPT_TEMPLATE } from '@/src/prompts/transits-prompt';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTodayDateId(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the dateId (YYYY-MM-DD) for the most recent Sunday (or today if today is Sunday).
 * Transit readings are keyed by week so they regenerate once per week.
 */
export function getThisWeekDateId(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // rewind to Sunday (d.getDay() === 0 on Sunday → no change)
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

function renderPrompt(vars: {
  natalChart: string;
  currentTransits: string;
  date: string;
  pronouns: string;
}): string {
  return TRANSITS_PROMPT_TEMPLATE
    .replace('{{natalChart}}', vars.natalChart)
    .replace('{{currentTransits}}', vars.currentTransits)
    .replace('{{date}}', vars.date)
    .replace(/\{\{pronouns\}\}/g, vars.pronouns);
}

function parseResult(data: Record<string, any>): TransitReadingResult | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  try {
    if (typeof raw !== 'string') return raw as TransitReadingResult;
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      // Repair: occasionally the model omits `},{` between consecutive
      // house objects, leaving `"interpretation": "..." , "house": "..."`
      // with duplicate keys — JSON.parse keeps the last, dropping the
      // earlier house. Insert the missing object boundary.
      .replace(
        /("interpretation"\s*:\s*"(?:[^"\\]|\\.)*")\s*,\s*("house"\s*:)/g,
        '$1},{$2',
      )
      // Hermes is stricter than V8 — trailing commas before } or ] are invalid.
      .replace(/,(\s*[}\]])/g, '$1')
      .trim();
    return JSON.parse(cleaned);
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
  const state: string = (data?.status?.state ?? '').toLowerCase();
  if (state === 'complete' || state === 'completed') {
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
  pronouns = 'they/them',
): Promise<void> {
  const natalChart = buildNatalChartSummary(chart);
  const currentTransits = buildTransitsSummary(transits);
  const date = formatDateLabel(dateId);

  const prompt = renderPrompt({ natalChart, currentTransits, date, pronouns });

  const docRef = doc(db, 'users', uid, 'transits', dateId);

  // Delete before writing so the Extension's onDocumentCreated trigger always
  // fires — same reasoning as breakdown and horoscope services.
  await deleteDoc(docRef);

  await setDoc(docRef, {
    prompt,
    natalChart,
    currentTransits,
    date,
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
      logGenerationModel('transits', data);
      const state: string = (data?.status?.state ?? '').toLowerCase();
      if (state !== 'complete' && state !== 'completed') return;
      const result = parseResult(data);
      if (result) onResult(result);
    },
    (err) => {
      logger.error('[transits] reading listener failed', err, 'transit_snapshot');
    },
  );
}
