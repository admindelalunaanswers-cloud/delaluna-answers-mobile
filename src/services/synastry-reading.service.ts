import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { logger } from '@/src/utils/logger';
import { logGenerationModel } from '@/src/utils/generation-model';

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
    key:    `${a.planet1}-${a.planet2}`,
    pair:   `${nameA}'s ${a.planet1} meeting ${nameB}'s ${a.planet2}`,
    aspect: a.type.toLowerCase(),
    orb:    Math.round(a.orb * 100) / 100,
    nature: a.nature,
  }));
}

type AspectSummary = ReturnType<typeof summarizeAspects>;

/**
 * Build a readable bullet list of the curated top aspects so the model
 * sees them surfaced separately from the dense JSON chart blob. Each line:
 *   - [nature] {nameA}'s {planet1} meeting {nameB}'s {planet2} ({aspect}, orb X°) [key: Planet1-Planet2]
 */
function formatTopAspects(aspects: AspectSummary): string {
  if (aspects.length === 0) return '(none — no significant cross-chart aspects)';
  return aspects
    .map(a => `- [${a.nature}] ${a.pair} (${a.aspect}, orb ${a.orb}°) [key: ${a.key}]`)
    .join('\n');
}

/**
 * Build the JSON-serialized data block + readable aspect list for the prompt.
 * The JSON carries both charts' placements; the formatted aspect list is the
 * curated topAspects surfaced separately so the model can anchor each section
 * to specific interactions without parsing them out of the JSON blob.
 */
function buildSynastryData(
  chartA: NatalChart,
  chartB: NatalChart,
  nameA: string,
  nameB: string,
): { synastryData: string; topAspects: string } {
  const rawAspects = calculateSynastry(chartA.planets, chartB.planets);
  const scored     = selectTopAspects(rawAspects);
  const aspects    = summarizeAspects(scored, nameA, nameB);

  const synastryData = JSON.stringify({
    [nameA]: summarizeChart(chartA),
    [nameB]: summarizeChart(chartB),
    topAspects: aspects,
  });

  return { synastryData, topAspects: formatTopAspects(aspects) };
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
      const aspectDescriptions =
        parsed.aspectDescriptions &&
        typeof parsed.aspectDescriptions === 'object' &&
        !Array.isArray(parsed.aspectDescriptions)
          ? Object.fromEntries(
              Object.entries(parsed.aspectDescriptions).filter(
                ([, v]) => typeof v === 'string',
              ),
            ) as Record<string, string>
          : undefined;

      return {
        loveLanguage: parsed.loveLanguage,
        conflictStyle: parsed.conflictStyle,
        longevity: parsed.longevity,
        ...(aspectDescriptions ? { aspectDescriptions } : {}),
      };
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
  const { synastryData, topAspects } = buildSynastryData(chartA, chartB, nameA, nameB);
  const prompt      = buildSynastryPrompt(nameA, nameB, synastryData, topAspects);
  const requestedAt = serverTimestamp();

  await setDoc(
    doc(db, 'users', uid, 'connections', connectionId, 'synastryReading', READING_DOC),
    { prompt, synastryData, topAspects, nameA, nameB, requestedAt },
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
      logGenerationModel('synastry', snap.data());
      const result = parseResult(snap.data());
      if (result) onResult(result);
    },
    (err) => {
      logger.error('[synastry] reading listener failed', err, 'synastry_snapshot');
    },
  );
}
