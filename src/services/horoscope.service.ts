import { deleteDoc, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { calculateTransits } from '@/src/services/astroEngine';
import { getTarotCardDraw } from '@/src/services/tarot-card.service';
import { measure } from '@/src/services/performance.service';
import { HOROSCOPE_PROMPT_TEMPLATE } from '@/src/prompts/horoscope-prompt';

const RETROGRADE_PLANETS = new Set([
  'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
]);

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
  pronouns: string;
}): string {
  return HOROSCOPE_PROMPT_TEMPLATE
    .replace('{{tarotKeywords}}', vars.tarotKeywords)
    .replace('{{natalChart}}', vars.natalChart)
    .replace('{{date}}', vars.date)
    .replace('{{todaysMoon}}', vars.todaysMoon)
    .replace('{{retrogradeplanets}}', vars.retrogradeplanets)
    .replace(/\{\{pronouns\}\}/g, vars.pronouns);
}

function parseResult(data: Record<string, any>): HoroscopeResult | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  try {
    if (typeof raw !== 'string') return raw as HoroscopeResult;
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    // Hermes is stricter than V8 — trailing commas before } or ] are invalid.
    const sanitized = stripped.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(sanitized);
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
  const result = parseResult(data);
  if (result) return { result, pending: false };
  // No result yet — pending if a prompt was already written
  if (!data?.prompt) return { result: null, pending: false };
  return { result: null, pending: true };
}

async function writeHoroscopeDoc(
  uid: string,
  dateId: string,
  natalChart: string,
  moon: MoonSummary,
  retrogrades: string[],
  tarotKeywords: string,
  pronouns = 'they/them',
): Promise<void> {
  const date = formatDateLabel(dateId);
  const todaysMoonStr = formatMoonSummary(moon);
  const retrogradeStr = retrogrades.length > 0 ? retrogrades.join(', ') : 'No planets in retrograde';

  const prompt = renderPrompt({
    tarotKeywords,
    natalChart,
    date,
    todaysMoon: todaysMoonStr,
    retrogradeplanets: retrogradeStr,
    pronouns,
  });

  const docRef = doc(db, 'users', uid, 'horoscope', dateId);

  // Delete before writing so the Extension's onDocumentCreated trigger always
  // fires. Overwriting an existing document only triggers onDocumentWritten;
  // if the Extension uses onCreate, the re-request would be silently ignored.
  // deleteDoc on a non-existent document is a safe no-op.
  await deleteDoc(docRef);

  await setDoc(docRef, {
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
 * Writes the trigger document for today's horoscope only.
 * Call requestSurroundingHoroscopes separately (after transits + breakdown)
 * so the extension prioritises today's reading.
 */
export async function requestHoroscope(
  uid: string,
  dateId: string,
  chart: NatalChartDetailsDoc,
  todaysMoon: MoonSummary,
  retrogradeplanets: string[] = [],
  pronouns = 'they/them',
  options?: { skipTarotDraw?: boolean },
): Promise<void> {
  const natalChart = buildNatalChartSummary(chart);

  // Skip tarot draw when regenerating from a birth-data edit (cards are unchanged).
  const tarotDraw = options?.skipTarotDraw
    ? null
    : await getTarotCardDraw(uid, 3).catch(() => null);

  await writeHoroscopeDoc(
    uid, dateId, natalChart,
    todaysMoon,
    retrogradeplanets,
    tarotDraw?.today.keywordString ?? '',
    pronouns,
  );
}

/**
 * Writes trigger documents for yesterday and tomorrow in the background.
 * Call this after today's horoscope, transit reading, and breakdown have been requested.
 */
export async function requestSurroundingHoroscopes(
  uid: string,
  dateId: string,
  chart: NatalChartDetailsDoc,
  pronouns = 'they/them',
): Promise<void> {
  const natalChart  = buildNatalChartSummary(chart);
  const yesterdayId = offsetDateId(dateId, -1);
  const tomorrowId  = offsetDateId(dateId, +1);

  // Check existence before writing — avoids overwriting docs that already have
  // a completed response (or are pending), which would strip the response and
  // leave the doc stuck with only a prompt field.
  const [yesterdaySnap, tomorrowSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'horoscope', yesterdayId)),
    getDoc(doc(db, 'users', uid, 'horoscope', tomorrowId)),
  ]);

  const needsYesterday = !yesterdaySnap.exists();
  const needsTomorrow  = !tomorrowSnap.exists();

  if (!needsYesterday && !needsTomorrow) return;

  const tarotDraw = await getTarotCardDraw(uid, 3).catch(() => null);

  if (needsYesterday) {
    calculateTransits(dateIdToDate(yesterdayId))
      .then(t => writeHoroscopeDoc(
        uid, yesterdayId, natalChart,
        t.moon,
        t.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name),
        tarotDraw?.yesterday.keywordString ?? '',
        pronouns,
      ))
      .catch(console.error);
  }

  if (needsTomorrow) {
    calculateTransits(dateIdToDate(tomorrowId))
      .then(t => writeHoroscopeDoc(
        uid, tomorrowId, natalChart,
        t.moon,
        t.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name),
        tarotDraw?.tomorrow.keywordString ?? '',
        pronouns,
      ))
      .catch(console.error);
  }
}

/**
 * Day-rollover maintenance — call once when the app opens on a new day.
 *
 * 1. Deletes the doc for 2 days ago (no longer displayed).
 * 2. If today's doc is missing (pre-generation failed), generates it (awaited).
 * 3. If tomorrow's doc is missing, generates it in the background.
 *
 * Today's horoscope was expected to be pre-generated as "tomorrow" the
 * previous day. If it's still pending (extension not finished), this leaves
 * it alone so the existing listener can resolve it naturally.
 */
export async function rolloverHoroscope(
  uid: string,
  chart: NatalChartDetailsDoc,
  pronouns = 'they/them',
): Promise<void> {
  return measure('horoscope_rollover', async () => {
    const dateId     = getTodayDateId();
    const twoDaysAgo = offsetDateId(dateId, -2);
    const tomorrowId = offsetDateId(dateId, +1);
    const natalChart = buildNatalChartSummary(chart);

    // Remove the oldest doc — failure is harmless
    deleteDoc(doc(db, 'users', uid, 'horoscope', twoDaysAgo)).catch(() => {});

    // Check today and tomorrow in parallel
    const [todaySnap, tomorrowSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid, 'horoscope', dateId)),
      getDoc(doc(db, 'users', uid, 'horoscope', tomorrowId)),
    ]);

    const todayMissing    = !todaySnap.exists();
    const tomorrowMissing = !tomorrowSnap.exists();

    if (!todayMissing && !tomorrowMissing) return;

    // Tarot draw is seeded by date — same cards every call for the same day
    const tarotDraw = await getTarotCardDraw(uid, 3).catch(() => null);

    // Generate today if missing — awaited so the user sees it immediately
    if (todayMissing) {
      try {
        const t = await calculateTransits(new Date());
        const retrogrades = t.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name);
        await writeHoroscopeDoc(
          uid, dateId, natalChart,
          t.moon, retrogrades,
          tarotDraw?.today.keywordString ?? '',
          pronouns,
        );
      } catch (e) {
        console.error('rolloverHoroscope: failed to generate today', e);
      }
    }

    // Generate tomorrow if missing — fire and forget
    if (tomorrowMissing) {
      calculateTransits(dateIdToDate(tomorrowId))
        .then(t => writeHoroscopeDoc(
          uid, tomorrowId, natalChart,
          t.moon,
          t.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name),
          tarotDraw?.tomorrow.keywordString ?? '',
          pronouns,
        ))
        .catch(console.error);
    }
  });
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
      const result = parseResult(snap.data());
      if (result) onResult(result);
    },
  );
}
