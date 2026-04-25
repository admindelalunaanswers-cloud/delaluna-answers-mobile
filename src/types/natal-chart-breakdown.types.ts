export interface BreakdownHousePlanet {
  name: string;
  sign: string;
  degree: string;
  retrograde?: boolean; // premium only
}

export interface BreakdownHouse {
  house: string;
  sign: string;
  degree: string;
  ruler?: string; // premium only
  planets: BreakdownHousePlanet[];
  interpretation: string;
  locked: boolean;
}

export interface BreakdownPlanet {
  name: string;
  sign: string;
  degree: string;
  house: string;
  retrograde: boolean;
  interpretation: string;
}

export interface BreakdownAspect {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: string;
  interpretation: string;
}

/**
 * Unified result type for both free and premium tiers.
 * Free fields: quote, houses, personalitySnapshot, teaser, release
 * Premium adds: planets, aspects, loveRead, careerRead, growthRead,
 *               advice, warning, affirmation (no teaser)
 */
export interface NatalChartBreakdownResult {
  quote?: string;
  houses: BreakdownHouse[];
  personalitySnapshot?: string;
  teaser?: string;
  planets?: BreakdownPlanet[];
  aspects?: BreakdownAspect[];
  loveRead?: string;
  careerRead?: string;
  growthRead?: string;
  advice?: string;
  warning?: string;
  affirmation?: string;
  release?: string;
}
