/**
 * In-memory store for passing large data objects between screens.
 * Avoids URL serialization of complex chart objects with Expo Router.
 */

import type { calculateNatalChart } from '@/src/services/astroEngine';

export type SynastryAnalysisPayload = {
  chartA: Awaited<ReturnType<typeof calculateNatalChart>>;
  chartB: Awaited<ReturnType<typeof calculateNatalChart>>;
  nameA:  string;
  nameB:  string;
};

const store: {
  synastryAnalysis: SynastryAnalysisPayload | null;
} = {
  synastryAnalysis: null,
};

export const NavigationStore = {
  setSynastryAnalysis: (p: SynastryAnalysisPayload) => { store.synastryAnalysis = p; },
  getSynastryAnalysis: ()                           => store.synastryAnalysis,
};
