import { Timestamp } from 'firebase/firestore';

/**
 * Firestore structure:
 *
 *  users/{uid}                    ← this document (UserDoc)
 *    natalChart/details           ← NatalChartDetailsDoc
 *    natalChart/wheel             ← NatalChartSvgDoc  (wheel SVG)
 *    natalChart/table             ← NatalChartSvgDoc  (table SVG)
 *    purchases/{purchaseId}       ← PurchaseDoc
 */
export interface UserDoc {
  uid:            string;
  email:          string;
  isEmailVerified: boolean;
  fullName:           string;
  firstName:           string;
  lastName:           string;

  // Birth details
  birthday:       Timestamp;       // midnight UTC of birth date
  birthplace:     string;          // human-readable city/country
  isBirthPlaceUnknown: boolean;
  birthLat:       number;
  birthLon:       number;
  timezone:       number;          // UTC offset e.g. -5, +5.5
  birthTime:      string;          // "HH:MM" local time
  isBirthTimeUnknown: boolean;

  pronouns?:               string;  // e.g. "She/Her", "He/Him", "They/Them", "Non Binary"
  avatarIconId?:           string;  // Ionicons name, e.g. 'person-circle', 'moon', 'planet', 'star'
  isPremiumMember:         boolean;
  isAdmin?:                boolean;
  createdAt:               Timestamp;
  lastUpdatedAt?:          Timestamp;
  lastLoggedInAt?:         Timestamp;
  expoPushToken?:          string;
  birthDetailsChangeCount?: number;  // max 3 allowed
}

// ─── Subcollections ───────────────────────────────────────────────────────────

/**
 * users/{uid}/natalChart/details
 * Astrological data from astroEngine.
 */
export interface NatalChartDetailsDoc {
  createdAt:  Timestamp;
  planets:    SerializedPlanet[];
  houses:     SerializedHouses;
  moon:       SerializedMoon;
  ascendant:  ChartPoint;
  midheaven:  ChartPoint;
}

/**
 * users/{uid}/natalChart/wheel
 * users/{uid}/natalChart/table
 * SVG string saved after rendering.
 */
export interface NatalChartSvgDoc {
  svg:        string;    // full SVG markup
  updatedAt:  Timestamp;
}

/**
 * users/{uid}/purchases/{purchaseId}
 */
export type PurchaseType =
  | 'chat_questions'
  | '3day_horoscope'
  | 'monthly_horoscope'
  | 'synastry_report'
  | 'full_reading';

export interface PurchaseDoc {
  purchaseId:   string;
  type:         PurchaseType;
  quantity:     number;           // e.g. 5 extra chat questions
  purchasedAt:  Timestamp;
  expiresAt:    Timestamp | null; // null = no expiry
  receiptId:    string | null;    // App Store / Play Store receipt
}

// ─── Serialized chart types (plain objects, safe for Firestore) ───────────────

export interface SerializedPlanet {
  name:         string;
  symbol:       string;
  longitude:    number;
  sign:         string;
  signSymbol:   string;
  degree:       number;
  minutes:      number;
  seconds:      number;
  speed:        number;
  isRetrograde: boolean;
  house:        number;
}

export interface SerializedHouses {
  cusps:      number[];   // index 1–12
  ascendant:  number;
  mc:         number;
}

export interface SerializedMoon {
  longitude:    number;
  sign:         string;
  signSymbol:   string;
  degree:       number;
  minutes:      number;
  phase:        string;
  phaseEmoji:   string;
  illumination: number;
  sunMoonAngle: number;
  isRetrograde: boolean;
}

export interface ChartPoint {
  sign:       string;
  signSymbol: string;
  degree:     number;
  minutes:    number;
}
