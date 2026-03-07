export interface TransitHouseTransit {
  name: string;
  sign: string;
  degree: string;
}

export interface TransitHouseReading {
  house: string;
  interpretation: string;
  /** Computed client-side — not set by AI */
  locked?: boolean;
  natalDegree: string;
  natalSign: string;
  transits: TransitHouseTransit[];
}

export interface TransitReadingResult {
  overview?: string;
  quote?: string;
  release?: string;
  retrogradesActive?: string[];
  houses?: TransitHouseReading[];
}
