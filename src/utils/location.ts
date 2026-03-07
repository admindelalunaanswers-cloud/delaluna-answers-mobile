/**
 * location.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared location and timezone utilities used by test-screen and chat-flow.
 * Nominatim geocoding + Open-Meteo timezone detection, extracted verbatim from
 * test-screen so both screens behave identically.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address: {
    city?: string; town?: string; village?: string; municipality?: string;
    state?: string; country?: string;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Keep only results that have a city/town/village name in their structured address.
// Filters out counties, states, countries, and other non-city results regardless of Nominatim type.
export function hasCity(r: NominatimResult): boolean {
  const a = r.address;
  return !!(a.city ?? a.town ?? a.village ?? a.municipality);
}

export function formatPlace(r: NominatimResult): string {
  const a = r.address;
  const place = a.city ?? a.town ?? a.village ?? a.municipality;
  return [place, a.state, a.country].filter(Boolean).join(', ') || r.display_name;
}

/**
 * Given an IANA timezone name and a Date, return the UTC offset in hours
 * (e.g. -5 for CDT, +5.5 for IST) at that exact moment — DST included.
 * Rounds to nearest 15 min to cover offsets like Nepal +5:45, Chatham +12:45.
 */
export function getUtcOffsetHours(ianaTimezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => {
    const p = parts.find(x => x.type === type);
    return p ? parseInt(p.value) : 0;
  };
  let h = get('hour');
  if (h === 24) h = 0;  // midnight edge-case
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'));
  return Math.round((localMs - date.getTime()) / 900000) * 0.25;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Search Nominatim for city results matching `query`.
 * Returns deduplicated city-level results only.
 */
export async function searchNominatim(query: string): Promise<NominatimResult[]> {
  const resp = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'AstroNatal/1.0' } }
  );
  if (!resp.ok) throw new Error('Nominatim request failed');
  const all = await resp.json() as NominatimResult[];
  const seen = new Set<string>();
  return all.filter(r => {
    if (!hasCity(r)) return false;
    const label = formatPlace(r);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

/**
 * Detect the numeric UTC offset (e.g. -5 for EST) for a coordinate.
 * Uses Open-Meteo for the IANA timezone name, then computes the historical
 * DST-accurate offset using `birthDate` at noon UTC.
 *
 * Silent fail — returns 0 (UTC) on any error.
 */
export async function detectTimezoneOffset(
  latNum: number,
  lonNum: number,
  birthDate: Date
): Promise<number> {
  try {
    // Open-Meteo returns the IANA timezone name for any coordinate.
    // Free, no API key, extremely reliable. The `timezone` field at root
    // level is always present when timezone=auto is passed.
    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&timezone=auto&current=temperature_2m`
    );
    if (!resp.ok) return 0;
    const data = await resp.json() as { timezone?: string; utc_offset_seconds?: number };
    const tzName = data.timezone;
    if (!tzName) return Math.round(((data.utc_offset_seconds ?? 0) / 3600) * 4) / 4;

    // Use noon UTC on the birth date so historical DST rules apply correctly.
    const refDate = new Date(Date.UTC(
      birthDate.getFullYear(),
      birthDate.getMonth(),
      birthDate.getDate(),
      12, 0, 0
    ));

    try {
      return getUtcOffsetHours(tzName, refDate);
    } catch {
      // Intl fallback: use Open-Meteo's current UTC offset (may be off by
      // 1 hr at DST transitions vs. the historical birth-date offset).
      return Math.round(((data.utc_offset_seconds ?? 0) / 3600) * 4) / 4;
    }
  } catch {
    // silent fail — caller uses 0 (UTC)
    return 0;
  }
}

/**
 * Format a numeric UTC offset as a display string.
 * e.g. -5 → "UTC−5", 5.5 → "UTC+5:30"
 */
export function formatUtcOffset(offset: number): string {
  const sign = offset >= 0 ? '+' : '−';
  const absH = Math.floor(Math.abs(offset));
  const absM = Math.round((Math.abs(offset) % 1) * 60);
  return absM
    ? `UTC${sign}${absH}:${String(absM).padStart(2, '0')}`
    : `UTC${sign}${absH}`;
}
