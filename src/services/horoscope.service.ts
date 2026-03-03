import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { calculateTransits } from '@/src/services/astroEngine';
import { getTarotCardDraw } from '@/src/services/tarot-card.service';
import { HOROSCOPE_PROMPT_TEMPLATE } from '@/src/prompts/horoscope-prompt';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD (local time). */
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

/** Minimal moon shape — satisfied by both MoonData (astroEngine) and SerializedMoon (user types). */
export interface MoonSummary {
  sign: string;
  phase: string;
  illumination: number;
  degree: number;
}

/**
 * Serialise the natal chart to a compact JSON string for the prompt.
 * Omits raw numeric fields the AI doesn't need.
 */
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
    moon: {
      sign: chart.moon.sign,
      phase: chart.moon.phase,
      illumination: chart.moon.illumination,
    },
  });
}

function formatMoonSummary(moon: MoonSummary): string {
  return `${moon.sign} Moon, ${moon.phase}, ${moon.degree}° ${moon.illumination}% illumination`;
}

/** Offset a YYYY-MM-DD string by ±N days. */
function offsetDateId(dateId: string, days: number): string {
  const [y, m, d] = dateId.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Convert a YYYY-MM-DD string to a Date at noon local time. */
function dateIdToDate(dateId: string): Date {
  const [y, m, d] = dateId.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt;
}

/**
 * Parse the AI result from the Firestore document.
 * The extension may write a raw JSON string or a parsed object.
 */
function renderPrompt(vars: {
  tarotKeywords: string;
  natalChart: string;
  date: string;
  todaysMoon: string;
  retrogradeplanets: string;
}): string {
  return HOROSCOPE_PROMPT_TEMPLATE
    .replace('{{tarotKeywords}}', vars.tarotKeywords)
    .replace('{{natalChart}}', vars.natalChart)
    .replace('{{date}}', vars.date)
    .replace('{{todaysMoon}}', vars.todaysMoon)
    .replace('{{retrogradeplanets}}', vars.retrogradeplanets);
}

function parseResult(data: Record<string, any>): HoroscopeResult | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as HoroscopeResult);
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface HoroscopeFetchResult {
  result: HoroscopeResult | null;
  /** true when the document exists but generation hasn't completed yet */
  pending: boolean;
}

/**
 * One-time read of a horoscope document.
 * Returns the result if complete, or pending status if still generating.
 */
export async function fetchHoroscope(
  uid: string,
  dateId: string,
): Promise<HoroscopeFetchResult> {
  const snap = await getDoc(doc(db, 'users', uid, 'horoscope', dateId));
  if (!snap.exists()) return { result: null, pending: false };

  const data = snap.data();
  if (data?.status?.state === 'complete') {
    return { result: parseResult(data), pending: false };
  }
  return { result: null, pending: true };
}

async function writeHoroscopeDoc(
  uid: string,
  dateId: string,
  natalChart: string,
  moon: MoonSummary,
  retrogrades: string[],
  tarotKeywords: string,
): Promise<void> {
  const date = formatDateLabel(dateId);
  const todaysMoonStr = formatMoonSummary(moon);
  const retrogradeStr = retrogrades.length > 0 ? retrogrades.join(', ') : 'none';

  const prompt = renderPrompt({
    tarotKeywords,
    natalChart,
    date,
    todaysMoon: todaysMoonStr,
    retrogradeplanets: retrogradeStr,
  });

  await setDoc(doc(db, 'users', uid, 'horoscope', dateId), {
    prompt,
    tarotKeywords,
    natalChart,
    date,
    todaysMoon: todaysMoonStr,
    retrogradeplanets: retrogradeStr,
    requestedAt: serverTimestamp(),
  });
}

/**
 * Writes trigger documents for yesterday, today, and tomorrow.
 * Today uses the already-computed moon/retrogrades passed in by the caller.
 * Yesterday and tomorrow call calculateTransits for their respective dates
 * (lat/lon default to 0 — moon sign and retrograde status are ecliptic values
 * unaffected by geographic location).
 */
export async function requestHoroscope(
  uid: string,
  dateId: string,
  chart: NatalChartDetailsDoc,
  todaysMoon: MoonSummary,
  retrogradeplanets: string[] = [],
  options?: { skipTarotDraw?: boolean },
): Promise<void> {
  const natalChart = buildNatalChartSummary(chart);

  // Skip tarot draw when regenerating from a birth-data edit (cards are unchanged).
  const tarotDraw = options?.skipTarotDraw
    ? null
    : await getTarotCardDraw(uid, 3).catch(() => null);

  // Today is what the user sees first — await it.
  await writeHoroscopeDoc(
    uid, dateId, natalChart,
    todaysMoon,
    retrogradeplanets,
    tarotDraw?.today.keywordString ?? '',
  );

  // Yesterday and tomorrow are prefetched in the background.
  const yesterdayId = offsetDateId(dateId, -1);
  const tomorrowId  = offsetDateId(dateId, +1);

  calculateTransits(dateIdToDate(yesterdayId))
    .then(t => writeHoroscopeDoc(
      uid, yesterdayId, natalChart,
      t.moon,
      t.planets.filter(p => p.isRetrograde).map(p => p.name),
      tarotDraw?.yesterday.keywordString ?? '',
    ))
    .catch(console.error);

  calculateTransits(dateIdToDate(tomorrowId))
    .then(t => writeHoroscopeDoc(
      uid, tomorrowId, natalChart,
      t.moon,
      t.planets.filter(p => p.isRetrograde).map(p => p.name),
      tarotDraw?.tomorrow.keywordString ?? '',
    ))
    .catch(console.error);
}

/**
 * Real-time listener that resolves once the extension marks the document
 * complete. Returns an unsubscribe function.
 */
export function subscribeToHoroscope(
  uid: string,
  dateId: string,
  onResult: (result: HoroscopeResult) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'horoscope', dateId),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.status?.state !== 'complete') return;
      const result = parseResult(data);
      if (result) onResult(result);
    },
  );
}
