export interface FinalSignupPayload {
  email: string;
  name: string;
  birthday: string;           // "YYYY-MM-DD"
  birthtime: string | null;   // "HH:mm" (24h), null if unknown
  birthTimezone: number;      // numeric UTC offset e.g. -5 for EST, +5.5 for IST
  birthLat: number;           // decimal degrees, positive = N
  birthLon: number;           // decimal degrees, positive = E
  placeOfBirth: string | null;
  isBirthTimeUnknown: boolean;
  isPlaceOfBirthUnknown: boolean;
  [key: string]: any;
}
