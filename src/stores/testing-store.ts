/**
 * Simple in-memory store for passing large data objects between (testing) screens.
 * Avoids URL serialization of complex chart objects.
 */

import type { calculateNatalChart, calculateTransits, BirthData } from '@/src/services/astroEngine';

export type ResultsPayload = {
  natalChart:  Awaited<ReturnType<typeof calculateNatalChart>>;
  transits:    Omit<Awaited<ReturnType<typeof calculateTransits>>, 'date'>;
  transitDate: string;
  name:        string;
  birthData:   BirthData;
};

export type SynastryPayload = {
  chartA: Awaited<ReturnType<typeof calculateNatalChart>>;
  nameA:  string;
};

const store: {
  results:  ResultsPayload | null;
  synastry: SynastryPayload | null;
} = {
  results:  null,
  synastry: null,
};

export const TestingStore = {
  setResults:  (p: ResultsPayload)  => { store.results  = p; },
  getResults:  ()                   => store.results,
  setSynastry: (p: SynastryPayload) => { store.synastry = p; },
  getSynastry: ()                   => store.synastry,
};
