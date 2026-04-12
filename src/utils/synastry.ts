/**
 * synastry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared synastry logic used by both the ad-hoc compute screen
 * (app/connection/SynastryScreen.tsx) and the saved-connection viewer
 * (app/connection/[id]/synastry.tsx).
 */

import { Aspect } from '@/src/services/astroEngine';

// Cross-chart planet pairings we consider the most meaningful —
// these get highlighted in a "key connections" section above the full list.
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
