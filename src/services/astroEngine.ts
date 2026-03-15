/**
 * astroEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Astrological calculation engine built on react-native-swisseph (linchCN).
 * https://github.com/linchCN/react-native-swisseph
 * https://www.npmjs.com/package/react-native-swisseph
 *
 * API NOTES for this library (v0.1.12):
 *  - Method names are camelCase:  sweJulday, sweCalcUt, sweHouses, sweUtcToJd
 *  - sweJulday()     → returns number (synchronous)
 *  - sweCalcUt()     → returns Promise<{ longitude, latitude, distance, longitudeSpeed, ... }>
 *  - sweHouses()     → returns Promise<{ cusps: number[], ascendant, mc, armc, vertex, ... }>
 *  - sweUtcToJd()    → returns { tjd_et, tjd_ut }
 *  - sweUtcTimeZone()→ returns { year, month, day, hour, minute, second }
 *  - Constants: SE_GREG_CAL, SEFLG_SPEED, SEFLG_MOSEPH, SE_SUN, SE_MOON, etc.
 *
 * Ephemeris: SEFLG_MOSEPH (Moshier) — built into the binary, no .se1 files needed.
 * Accuracy: ~1 arc-second, perfectly suitable for astrology.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import swisseph from 'react-native-swisseph';

// ─── Planet IDs (linchCN library exposes these as constants) ──────────────────
// Fallback numeric values match Swiss Ephemeris standard if constants aren't exported
const PLANET_IDS = {
  Sun:      0,   // SE_SUN
  Moon:     1,   // SE_MOON
  Mercury:  2,   // SE_MERCURY
  Venus:    3,   // SE_VENUS
  Mars:     4,   // SE_MARS
  Jupiter:  5,   // SE_JUPITER
  Saturn:   6,   // SE_SATURN
  Uranus:   7,   // SE_URANUS
  Neptune:  8,   // SE_NEPTUNE
  Pluto:    9,   // SE_PLUTO
  'N. Node':11,  // SE_MEAN_NODE
  Chiron:   15,  // SE_CHIRON
};

const PLANET_SYMBOLS: Record<string, string> = {
  Sun:      '☉',
  Moon:     '☽',
  Mercury:  '☿',
  Venus:    '♀',
  Mars:     '♂',
  Jupiter:  '♃',
  Saturn:   '♄',
  Uranus:   '♅',
  Neptune:  '♆',
  Pluto:    'P',
  'N. Node':'☊',
  'S. Node':'☋',
  Chiron:   '⚷',
};

const ZODIAC = [
  { name: 'Aries',       sym: '♈' },
  { name: 'Taurus',      sym: '♉' },
  { name: 'Gemini',      sym: '♊' },
  { name: 'Cancer',      sym: '♋' },
  { name: 'Leo',         sym: '♌' },
  { name: 'Virgo',       sym: '♍' },
  { name: 'Libra',       sym: '♎' },
  { name: 'Scorpio',     sym: '♏' },
  { name: 'Sagittarius', sym: '♐' },
  { name: 'Capricorn',   sym: '♑' },
  { name: 'Aquarius',    sym: '♒' },
  { name: 'Pisces',      sym: '♓' },
];

// Each phase is centered on a primary event (0°/90°/180°/270°) spanning 45°.
// New Moon:         0° – 22.5°    Waxing Crescent: 22.5° – 67.5°
// First Quarter:  67.5° – 112.5°  Waxing Gibbous: 112.5° – 157.5°
// Full Moon:     157.5° – 202.5°  Waning Gibbous: 202.5° – 247.5°
// Last Quarter:  247.5° – 292.5°  Waning Crescent: 292.5° – 360°
const MOON_PHASES = [
  { name: 'New Moon',        emoji: '🌑', max: 22.5  },
  { name: 'Waxing Crescent', emoji: '🌒', max: 67.5  },
  { name: 'First Quarter',   emoji: '🌓', max: 112.5 },
  { name: 'Waxing Gibbous',  emoji: '🌔', max: 157.5 },
  { name: 'Full Moon',       emoji: '🌕', max: 202.5 },
  { name: 'Waning Gibbous',  emoji: '🌖', max: 247.5 },
  { name: 'Last Quarter',    emoji: '🌗', max: 292.5 },
  { name: 'Waning Crescent', emoji: '🌘', max: 360   },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BirthData {
  year: number;
  month: number;      // 1–12
  day: number;
  hour: number;       // local decimal hours
  minute: number;
  lat: number;        // decimal degrees, positive = N
  lon: number;        // decimal degrees, positive = E
  timezone: number;   // UTC offset e.g. -5 for EST, +5.5 for IST
}

export interface PlanetPosition {
  name: string;
  symbol: string;
  color: string;
  longitude: number;
  sign: string;
  signSymbol: string;
  degree: number;
  minutes: number;
  seconds: number;
  speed: number;         // degrees/day, negative = retrograde
  isRetrograde: boolean;
  house: number;         // 1–12
}

export interface HouseData {
  cusps: number[];       // index 1–12 are the 12 house cusps in degrees
  ascendant: number;
  mc: number;
}

export interface MoonData {
  longitude: number;
  sign: string;
  signSymbol: string;
  degree: number;
  minutes: number;
  phase: string;
  phaseEmoji: string;
  illumination: number;  // 0–100 %
  sunMoonAngle: number;  // 0–360 degrees
  isRetrograde: boolean;
}

export interface NatalChart {
  planets: PlanetPosition[];
  houses: HouseData;
  moon: MoonData;
  ascendant:  { sign: string; signSymbol: string; degree: number; minutes: number };
  midheaven:  { sign: string; signSymbol: string; degree: number; minutes: number };
}

export interface TransitData {
  planets: PlanetPosition[];
  moon: MoonData;
  date: Date;
}

// ─── Aspects ──────────────────────────────────────────────────────────────────

const ASPECT_DEFS = [
  { name: 'Conjunction', symbol: '☌', angle: 0,   orb: 8, nature: 'neutral'     as const },
  { name: 'Sextile',     symbol: '⚹', angle: 60,  orb: 4, nature: 'harmonious'  as const },
  { name: 'Square',      symbol: '□', angle: 90,  orb: 8, nature: 'challenging' as const },
  { name: 'Trine',       symbol: '△', angle: 120, orb: 8, nature: 'harmonious'  as const },
  { name: 'Quincunx',   symbol: '⚻', angle: 150, orb: 3, nature: 'minor'       as const },
  { name: 'Opposition',  symbol: '☍', angle: 180, orb: 8, nature: 'challenging' as const },
];

export interface Aspect {
  planet1: string;
  symbol1: string;
  planet2: string;
  symbol2: string;
  type: string;
  aspectSymbol: string;
  angle: number;
  orb: number;   // degrees from exact
  nature: 'harmonious' | 'challenging' | 'neutral' | 'minor';
}

/**
 * Calculate cross-chart (synastry) aspects.
 * Every planet in planetsA is compared against every planet in planetsB.
 * Returns the same Aspect type — planet1 belongs to chart A, planet2 to chart B.
 */
export function calculateSynastry(
  planetsA: PlanetPosition[],
  planetsB: PlanetPosition[],
): Aspect[] {
  const aspects: Aspect[] = [];

  for (const p1 of planetsA) {
    for (const p2 of planetsB) {
      let diff = Math.abs(p1.longitude - p2.longitude) % 360;
      if (diff > 180) diff = 360 - diff;

      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(diff - def.angle);
        if (orb <= def.orb) {
          aspects.push({
            planet1: p1.name, symbol1: p1.symbol,
            planet2: p2.name, symbol2: p2.symbol,
            type: def.name, aspectSymbol: def.symbol,
            angle: def.angle, orb,
            nature: def.nature,
          });
          break;
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}

export function calculateAspects(planets: PlanetPosition[]): Aspect[] {
  const aspects: Aspect[] = [];

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const p1 = planets[i];
      const p2 = planets[j];

      // Angular separation 0–180°
      let diff = Math.abs(p1.longitude - p2.longitude) % 360;
      if (diff > 180) diff = 360 - diff;

      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(diff - def.angle);
        if (orb <= def.orb) {
          aspects.push({
            planet1: p1.name, symbol1: p1.symbol,
            planet2: p2.name, symbol2: p2.symbol,
            type: def.name, aspectSymbol: def.symbol,
            angle: def.angle, orb,
            nature: def.nature,
          });
          break; // one aspect per pair
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function normLon(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

function lonToSign(lon: number) {
  const n   = normLon(lon);
  const idx = Math.floor(n / 30);
  const rem = n - idx * 30;
  return {
    sign:       ZODIAC[idx].name,
    signSymbol: ZODIAC[idx].sym,
    degree:     Math.floor(rem),
    minutes:    Math.floor((rem % 1) * 60),
    seconds:    Math.floor(((rem % 1) * 60 % 1) * 60),
  };
}

function getHouse(lon: number, cusps: number[]): number {
  const n = normLon(lon);
  for (let h = 1; h <= 12; h++) {
    const start = normLon(cusps[h]);
    const end   = normLon(cusps[h === 12 ? 1 : h + 1]);
    if (end > start) {
      if (n >= start && n < end) return h;
    } else {
      if (n >= start || n < end) return h;
    }
  }
  return 1;
}

function moonPhase(angle: number) {
  const n = normLon(angle);
  const p = MOON_PHASES.find(p => n < p.max) ?? MOON_PHASES[7];
  return { phase: p.name, phaseEmoji: p.emoji };
}

function illumination(angle: number): number {
  return Math.round(((1 - Math.cos((angle * Math.PI) / 180)) / 2) * 100);
}

// ─── Core calculation helpers ─────────────────────────────────────────────────

const FLAG = swisseph.SEFLG_SPEED | swisseph.SEFLG_MOSEPH;
const GREG = swisseph.SE_GREG_CAL;

/**
 * Convert local birth time to Julian Day (UT).
 * Computes JD at midnight of the birth date, then adds the UTC decimal hour.
 * UTC = local - timezone (timezone positive = hours east of Greenwich).
 * Using JD arithmetic avoids sweUtcTimeZone day-rollback edge cases.
 */
function birthToJD(b: BirthData): number {
  const jdMidnight = swisseph.sweJulday(b.year, b.month, b.day, 0, GREG);
  const utcHour    = b.hour + b.minute / 60 - b.timezone;
  return jdMidnight + utcHour / 24;
}

/**
 * Convert a JS Date (local device time) to Julian Day.
 */
function dateToJD(date: Date): number {
  const utcHour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  return swisseph.sweJulday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    utcHour,
    GREG
  );
}

/**
 * Calculate a single planet's position.
 * sweCalcUt returns Promise<{ longitude, latitude, distance, longitudeSpeed, ... }>
 */
async function calcPlanet(
  jd: number,
  name: string,
  cusps: number[]
): Promise<PlanetPosition> {
  const id     = PLANET_IDS[name as keyof typeof PLANET_IDS];
  const result = swisseph.sweCalcUt(jd, id, FLAG);

  const lon   = result.longitude;
  const speed = result.longitudeSpeed;
  const sign  = lonToSign(lon);
  const house = cusps.length > 1 ? getHouse(lon, cusps) : 1;

  return {
    name,
    symbol:      PLANET_SYMBOLS[name] ?? '?',
    color:       '#ffffff',   // set later by caller if needed
    longitude:   lon,
    ...sign,
    speed,
    isRetrograde: speed < 0,
    house,
  };
}

/**
 * Calculate all 12 house cusps, ASC, and MC using Placidus.
 * sweHouses returns Promise<{ cusps: number[], ascendant, mc, ... }>
 */
async function calcHouses(jd: number, lat: number, lon: number): Promise<HouseData> {
  // 'P' = Placidus house system; iflag=0 for default (geocentric, apparent)
  const result = swisseph.sweHouses(jd, 0, lat, lon, 'P');
  return {
    cusps:     result.cusp,       // index 0 unused; 1–12 are house cusps
    ascendant: result.ascmc[0],   // SE_ASC
    mc:        result.ascmc[1],   // SE_MC
  };
}

/**
 * Derive South Node from North Node (always exactly 180° opposite).
 */
function deriveSouthNode(nNode: PlanetPosition, cusps: number[]): PlanetPosition {
  const lon  = normLon(nNode.longitude + 180);
  const sign = lonToSign(lon);
  const house = cusps.length > 1 ? getHouse(lon, cusps) : 1;
  return {
    name:        'S. Node',
    symbol:      PLANET_SYMBOLS['S. Node'],
    color:       '#ffffff',
    longitude:   lon,
    ...sign,
    speed:       nNode.speed,
    isRetrograde: nNode.isRetrograde,
    house,
  };
}

/**
 * Build MoonData from planet positions (requires Sun and Moon already calculated).
 */
function buildMoonData(moon: PlanetPosition, sunLon: number): MoonData {
  const angle = normLon(moon.longitude - sunLon);
  const { phase, phaseEmoji } = moonPhase(angle);
  return {
    longitude:    moon.longitude,
    sign:         moon.sign,
    signSymbol:   moon.signSymbol,
    degree:       moon.degree,
    minutes:      moon.minutes,
    phase,
    phaseEmoji,
    illumination: illumination(angle),
    sunMoonAngle: Math.round(angle * 100) / 100,
    isRetrograde: moon.isRetrograde,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate a full natal chart.
 */
export async function calculateNatalChart(birth: BirthData): Promise<NatalChart> {
  const jd     = birthToJD(birth);
  const houses = await calcHouses(jd, birth.lat, birth.lon);

  // Calculate all planets in parallel
  const planets = await Promise.all(
    Object.keys(PLANET_IDS).map(name => calcPlanet(jd, name, houses.cusps))
  );

  const sunPlanet  = planets.find(p => p.name === 'Sun')!;
  const moonPlanet = planets.find(p => p.name === 'Moon')!;
  const nNode      = planets.find(p => p.name === 'N. Node')!;
  const moon       = buildMoonData(moonPlanet, sunPlanet.longitude);

  planets.push(deriveSouthNode(nNode, houses.cusps));

  const asc = lonToSign(houses.ascendant);
  const mc  = lonToSign(houses.mc);

  return {
    planets,
    houses,
    moon,
    ascendant:  { sign: asc.sign, signSymbol: asc.signSymbol, degree: asc.degree, minutes: asc.minutes },
    midheaven:  { sign: mc.sign,  signSymbol: mc.signSymbol,  degree: mc.degree,  minutes: mc.minutes  },
  };
}

/**
 * Calculate current transits for a given date and observer location.
 * Lat/lon are used for house calculation; if unknown, pass 0, 0.
 */
export async function calculateTransits(
  date: Date,
  lat: number = 0,
  lon: number = 0
): Promise<TransitData> {
  const jd = dateToJD(date);
  const houses = await calcHouses(jd, lat, lon);

  const planets = await Promise.all(
    Object.keys(PLANET_IDS).map(name => calcPlanet(jd, name, houses.cusps))
  );

  const sunPlanet  = planets.find(p => p.name === 'Sun')!;
  const moonPlanet = planets.find(p => p.name === 'Moon')!;
  const nNode      = planets.find(p => p.name === 'N. Node')!;
  const moon       = buildMoonData(moonPlanet, sunPlanet.longitude);

  planets.push(deriveSouthNode(nNode, houses.cusps));

  return { planets, moon, date };
}
