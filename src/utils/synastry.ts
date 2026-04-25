/**
 * synastry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared synastry logic:
 *   1. Legacy `summarizeSynastry` — still used by the ad-hoc compute screen
 *      (app/connection/SynastryScreen.tsx) for its key-pair highlight list
 *      and its harmonious/neutral/challenging count pills.
 *   2. Scoring + curation — picks the 5–7 most significant aspects between
 *      two charts, ranked by planet significance, aspect type, and orb
 *      tightness. Each one becomes a section subject on the analysis screen.
 *   3. Prompt payload builder — turns the scored list into the exact shape
 *      the AI narrative generator expects. Names are baked into the pair
 *      strings so the model never has to reason about chart ownership.
 */

import { Aspect } from '@/src/services/astroEngine';

// ─── Legacy key-pair highlight (still used by SynastryScreen.tsx) ───────────

export const KEY_SYNASTRY_PAIRS: ReadonlySet<string> = new Set([
  'Sun|Moon', 'Moon|Sun',
  'Sun|Venus', 'Venus|Sun',
  'Sun|Sun',
  'Moon|Moon',
  'Venus|Mars', 'Mars|Venus',
  'Moon|Venus', 'Venus|Moon',
  'Sun|Jupiter', 'Jupiter|Sun',
  'Mercury|Mercury',
]);

export function isKeySynastryPair(a: Aspect): boolean {
  return KEY_SYNASTRY_PAIRS.has(`${a.planet1}|${a.planet2}`);
}

export type SynastrySummary = {
  keyAspects:   Aspect[];
  otherAspects: Aspect[];
  harmonious:   number;
  neutral:      number;
  challenging:  number;
};

export function summarizeSynastry(aspects: Aspect[]): SynastrySummary {
  const keyAspects: Aspect[]   = [];
  const otherAspects: Aspect[] = [];
  let harmonious  = 0;
  let neutral     = 0;
  let challenging = 0;

  for (const a of aspects) {
    if (isKeySynastryPair(a)) keyAspects.push(a);
    else otherAspects.push(a);

    if (a.nature === 'harmonious')       harmonious++;
    else if (a.nature === 'neutral')     neutral++;
    else if (a.nature === 'challenging') challenging++;
  }

  return { keyAspects, otherAspects, harmonious, neutral, challenging };
}

// ─── Scoring ────────────────────────────────────────────────────────────────
//
// Keys match astroEngine outputs exactly:
//   - Planet names from PLANET_SYMBOLS ('N. Node' with space + period)
//   - Aspect type names from ASPECT_DEFS (capitalized: 'Conjunction', etc.)
// Any mismatch here silently scores 0 and drops the aspect — so when adding
// new planets or aspect types, audit both sides.

const PLANET_WEIGHTS: Record<string, number> = {
  Sun: 10, Moon: 10,
  Venus: 8, Mars: 8,
  Mercury: 6,
  Jupiter: 5, Saturn: 5,
  'N. Node': 4,
  Uranus: 3, Neptune: 3, Pluto: 3,
  Chiron: 2,
};

const ASPECT_WEIGHTS: Record<string, number> = {
  Conjunction: 10,
  Opposition:   8,
  Square:       7,
  Trine:        7,
  Sextile:      5,
  Quincunx:     2,
};

// Curation orbs — tighter than astroEngine's raw orbs, so the scored list
// only picks aspects that are close enough to actually matter.
const MAX_ORBS: Record<string, number> = {
  Conjunction: 8,
  Opposition:  8,
  Square:      6,
  Trine:       6,
  Sextile:     4,
  Quincunx:    2,
};

const SCORE_FLOOR = 15;
const MIN_ASPECTS = 5;
const MAX_ASPECTS = 7;

export type ScoredAspect = Aspect & {
  id:    number;
  score: number;
};

export function scoreAspect(aspect: Aspect): number | null {
  const maxOrb = MAX_ORBS[aspect.type];
  if (!maxOrb || aspect.orb > maxOrb) return null;

  const orbBonus = (1 - aspect.orb / maxOrb) * 5;
  const p1       = PLANET_WEIGHTS[aspect.planet1] ?? 0;
  const p2       = PLANET_WEIGHTS[aspect.planet2] ?? 0;
  const typeW    = ASPECT_WEIGHTS[aspect.type]    ?? 0;

  return p1 + p2 + typeW + orbBonus;
}

/**
 * Rank all aspects, keep the top MAX_ASPECTS that clear SCORE_FLOOR.
 * If fewer than MIN_ASPECTS clear the floor, backfill from the highest
 * remaining aspects so the subject list always has at least 5 entries
 * when any real aspects exist at all.
 */
export function selectTopAspects(aspects: Aspect[]): ScoredAspect[] {
  const ranked = aspects
    .map((a, i) => {
      const score = scoreAspect(a);
      if (score === null) return null;
      return { ...a, id: i, score: Math.round(score * 100) / 100 };
    })
    .filter((a): a is ScoredAspect => a !== null)
    .sort((a, b) => b.score - a.score);

  const aboveFloor = ranked.filter(a => a.score >= SCORE_FLOOR);

  if (aboveFloor.length >= MIN_ASPECTS) {
    return aboveFloor.slice(0, MAX_ASPECTS);
  }

  // Backfill: not enough strong aspects, pad from the rest of the ranked list.
  return ranked.slice(0, Math.min(MIN_ASPECTS, ranked.length));
}

// The AI prompt template + builder lives in src/prompts/synastry-prompt.ts.
// The request/response flow lives in src/services/synastry-reading.service.ts.
// This module only exposes scoring + selection so both pieces can share the
// same curated top-N aspect list.
