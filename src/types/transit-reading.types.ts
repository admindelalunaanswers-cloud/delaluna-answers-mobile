export interface TransitPlanetReading {
  planet: string;
  sign: string;
  house?: string;
  retrograde?: boolean;
  interpretation: string;
}

/**
 * Unified result for both free and premium transit reading tiers.
 * Free:    quote, overview, themes, teaser, release
 * Premium: adds planets, advice, warning, affirmation, loveTransits, careerTransits
 */
export interface TransitReadingResult {
  quote?: string;
  overview?: string;
  themes?: string[];
  planets?: TransitPlanetReading[];
  advice?: string;
  warning?: string;
  affirmation?: string;
  teaser?: string;
  loveTransits?: string;
  careerTransits?: string;
  release?: string;
}
