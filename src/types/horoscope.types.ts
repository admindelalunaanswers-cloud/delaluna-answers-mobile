export interface HoroscopeResult {
  // Core sections
  quote?: string;
  advice?: string;
  affirmation?: string;
  warning?: string;

  // List sections (AI output uses "do" / "dont")
  do?: string[];
  dont?: string[];

  // Moon
  moonPhaseDetails?: string;
  moon?: string;

  // Astro
  planetsRetrograde?: string[];
  transits?: string;

  // Tarot
  tarot?: string;

  // Compatibility
  newLove?: string[];
  returns?: string[];

  // Extras
  luckyNumbers?: string[];
  release?: string;

  // Legacy field names kept for backwards compat
  dos?: string[];
  donts?: string[];
  message?: string;

  [key: string]: any;
}
