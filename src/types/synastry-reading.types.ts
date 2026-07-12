/**
 * Shape returned by the synastry-reading Firebase Extension.
 * The three section fields are plain strings rendered directly as
 * paragraphs in the three-section layout on the synastry analysis
 * screen. `aspectDescriptions` is a map keyed by "Planet1-Planet2"
 * (matching entries in the curated topAspects list) with 1-2
 * sentence plain-language descriptions of each interaction.
 */
export interface SynastryReadingResult {
  loveLanguage: string;
  conflictStyle: string;
  longevity: string;
  aspectDescriptions?: Record<string, string>;
}
