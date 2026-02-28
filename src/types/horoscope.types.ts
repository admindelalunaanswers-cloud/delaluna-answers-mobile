export interface HoroscopeResult {
  quote?:       string;
  advice?:      string;
  dos?:         string[];
  donts?:       string[];
  affirmation?: string;
  message?:     string;
  warning?:     string;
  [key: string]: any;   // allow additional AI-generated fields
}
