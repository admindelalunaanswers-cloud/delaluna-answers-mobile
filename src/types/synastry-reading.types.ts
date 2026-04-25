/**
 * Shape returned by the synastry-reading Firebase Extension.
 * Every field is a plain string — rendered directly as a paragraph
 * in the three-section layout on the synastry analysis screen.
 */
export interface SynastryReadingResult {
  loveLanguage: string;
  conflictStyle: string;
  longevity: string;
}
