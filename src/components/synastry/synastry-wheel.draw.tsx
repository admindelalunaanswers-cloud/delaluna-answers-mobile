/**
 * SynastryWheel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Composite synastry wheel — both natal charts drawn on the same wheel.
 *
 * - Anchored on Chart A's ASC at 9-o'clock (standard synastry convention).
 * - Chart A's houses provide the house grid and axis labels.
 * - Chart A planets ride the outer ring, Chart B planets ride the inner ring.
 * - Cross-chart aspect lines are drawn only for the aspects passed in via
 *   `highlightedAspects` (the scored top 5–7), so the wheel stays visually
 *   aligned with the narrative sections below it.
 *
 * Color code matches the header accents:
 *   - Person A → C.purpleLight
 *   - Person B → C.gold
 */

import React, { useMemo } from 'react';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { Aspect, NatalChart } from '@/src/services/astroEngine';
import { C } from '@/src/constants/theme';

// ─── Palette ────────────────────────────────────────────────────────────────

const RING       = 'rgba(255,255,255,0.18)';
const SIGN_DIV   = 'rgba(255,255,255,0.12)';
const SIGN_TXT   = '#c0c0d8';
const HOUSE_LINE = 'rgba(99, 97, 97, 0.95)';
const AXIS_LINE  = 'rgba(255,255,255,0.30)';
const HNUM_TXT   = 'rgba(255,255,255,0.18)';
const LABEL_TXT  = '#a0a0c0';

const A_COLOR = C.purpleLight;  // Person A — cool
const B_COLOR = C.gold;         // Person B — warm

// Nature-tinted aspect lines, aligned with the screen's color semantics.
const ASPECT_NATURE_COLOR: Record<Aspect['nature'], string> = {
  harmonious:  '#41FF88',
  challenging: '#FF3B3B',
  neutral:     '#FFDD00',
  minor:       '#9098b8',
};

const ZODIAC_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Planets rendered on the wheel. Nodes + outers are shown but Chiron is
// suppressed to keep visual density manageable in a two-chart overlay.
const MAIN_PLANETS = new Set([
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'N. Node',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function midLon(a: number, b: number): number {
  return norm(a + norm(b - a) / 2);
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  chartA: NatalChart;
  chartB: NatalChart;
  /** Top-scored cross-chart aspects that should render as lines. */
  highlightedAspects?: Aspect[];
  size: number;
}

export default function SynastryWheel({ chartA, chartB, highlightedAspects = [], size }: Props) {
  const cx = size / 2;
  const cy = size / 2;

  // ── Radii ────────────────────────────────────────────────────────────────
  const baseR      = size * 0.44;
  const rOuter     = baseR;
  const rZodiacIn  = baseR * 0.80;
  const rSignMid   = baseR * 0.90;
  const rPlanetA   = baseR * 0.70;   // Person A — outer ring
  const rPlanetB   = baseR * 0.54;   // Person B — inner ring
  const rPosDotA   = baseR * 0.795;
  const rPosDotB   = baseR * 0.795;  // both ticks land at the zodiac boundary
  const rHouseIn   = baseR * 0.42;
  const rHouseNum  = baseR * 0.37;
  const rLabel     = baseR * 1.07;

  const asc   = chartA.houses.ascendant;
  const mc    = chartA.houses.mc;
  const cusps = chartA.houses.cusps;

  // ── Geometry anchored on Chart A's ASC ──────────────────────────────────
  function svgA(lon: number): number {
    return (asc - lon - 180) * (Math.PI / 180);
  }
  function px(lon: number, r: number): number {
    return cx + r * Math.cos(svgA(lon));
  }
  function py(lon: number, r: number): number {
    return cy + r * Math.sin(svgA(lon));
  }
  function f(n: number): string { return n.toFixed(2); }

  function signLabelRotation(midL: number): number {
    const a = svgA(midL);
    let rot = a * (180 / Math.PI) + 90;
    rot = ((rot % 360) + 360) % 360;
    if (rot > 180) rot -= 360;
    if (rot > 90)       rot -= 180;
    else if (rot < -90) rot += 180;
    return rot;
  }

  function axisLabelRotation(lon: number): number {
    const a = svgA(lon);
    let rot = a * (180 / Math.PI) + 90;
    rot = ((rot % 360) + 360) % 360;
    if (rot > 180) rot -= 360;
    if (rot >= 90)      rot -= 180;
    else if (rot < -90) rot += 180;
    return rot;
  }

  // ── Font sizes ──────────────────────────────────────────────────────────
  const fsSign    = size * 0.023;
  const fsPlanet  = size * 0.040;
  const fsHouseNo = size * 0.018;
  const fsLabel   = size * 0.024;
  const fsMarker  = size * 0.017;

  // ── Visible planets ─────────────────────────────────────────────────────
  const planetsA = useMemo(
    () => chartA.planets.filter(p => MAIN_PLANETS.has(p.name)),
    [chartA.planets],
  );
  const planetsB = useMemo(
    () => chartB.planets.filter(p => MAIN_PLANETS.has(p.name)),
    [chartB.planets],
  );

  // Collision spreading — only within the same ring, not cross-chart.
  const spread = (planets: typeof planetsA, baseRadius: number) => {
    const radii: Record<string, number> = {};
    planets.forEach(p => { radii[p.name] = baseRadius; });
    const sorted = [...planets].sort((a, b) => a.longitude - b.longitude);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (norm(sorted[j].longitude - sorted[i].longitude) < 8) {
          radii[sorted[j].name] = baseRadius + baseR * 0.08;
        }
      }
    }
    return radii;
  };

  const radiiA = useMemo(() => spread(planetsA, rPlanetA), [planetsA, rPlanetA]);
  const radiiB = useMemo(() => spread(planetsB, rPlanetB), [planetsB, rPlanetB]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Svg width={size} height={size}>

      {/* Boundary rings */}
      <Circle cx={cx} cy={cy} r={rOuter}    fill="none" stroke={RING} strokeWidth={3} />
      <Circle cx={cx} cy={cy} r={rZodiacIn} fill="none" stroke={RING} strokeWidth={2} />

      {/* Sign dividers */}
      {Array.from({ length: 12 }, (_, i) => i * 30).map(lon => (
        <Line
          key={`div${lon}`}
          x1={px(lon, rZodiacIn)} y1={py(lon, rZodiacIn)}
          x2={px(lon, rOuter)}    y2={py(lon, rOuter)}
          stroke={SIGN_DIV}
          strokeWidth={0.5}
        />
      ))}

      {/* Floating sign names */}
      {ZODIAC_NAMES.map((name, i) => {
        const midL = midLon(i * 30, (i + 1) * 30);
        const tx   = px(midL, rSignMid);
        const ty   = py(midL, rSignMid);
        const rot  = signLabelRotation(midL);
        return (
          <SvgText
            key={`z${i}`}
            x={tx} y={ty}
            fill={SIGN_TXT}
            fontSize={fsSign}
            fontWeight="400"
            textAnchor="middle"
            alignmentBaseline="central"
            transform={`rotate(${f(rot)}, ${f(tx)}, ${f(ty)})`}
          >
            {name.toUpperCase()}
          </SvgText>
        );
      })}

      {/* House grid (Chart A) */}
      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
        const lon    = cusps[h] ?? 0;
        const isAxis = h === 1 || h === 4 || h === 7 || h === 10;
        return (
          <Line
            key={`hc${h}`}
            x1={px(lon, rHouseIn)}  y1={py(lon, rHouseIn)}
            x2={px(lon, rZodiacIn)} y2={py(lon, rZodiacIn)}
            stroke={isAxis ? AXIS_LINE : HOUSE_LINE}
            strokeWidth={isAxis ? 0.8 : 0.4}
          />
        );
      })}

      {/* ASC/DSC axis */}
      <Line
        x1={px(asc, rZodiacIn)}             y1={py(asc, rZodiacIn)}
        x2={px(norm(asc + 180), rZodiacIn)} y2={py(norm(asc + 180), rZodiacIn)}
        stroke={AXIS_LINE} strokeWidth={0.8}
      />
      {/* MC/IC axis */}
      <Line
        x1={px(mc, rZodiacIn)}             y1={py(mc, rZodiacIn)}
        x2={px(norm(mc + 180), rZodiacIn)} y2={py(norm(mc + 180), rZodiacIn)}
        stroke={AXIS_LINE} strokeWidth={0.5} opacity={0.6}
      />

      {/* House numbers */}
      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
        const nextH = h === 12 ? 1 : h + 1;
        const mid   = midLon(cusps[h] ?? 0, cusps[nextH] ?? 0);
        return (
          <SvgText
            key={`hn${h}`}
            x={px(mid, rHouseNum)}
            y={py(mid, rHouseNum)}
            fill={HNUM_TXT}
            fontSize={fsHouseNo}
            textAnchor="middle"
            alignmentBaseline="central"
          >
            {h}
          </SvgText>
        );
      })}

      {/* Cross-chart aspect lines — highlighted scored aspects only */}
      {highlightedAspects.map((asp, i) => {
        const p1 = chartA.planets.find(p => p.name === asp.planet1);
        const p2 = chartB.planets.find(p => p.name === asp.planet2);
        if (!p1 || !p2) return null;
        const color = ASPECT_NATURE_COLOR[asp.nature];
        return (
          <Line
            key={`asp${i}`}
            x1={px(p1.longitude, rHouseIn)} y1={py(p1.longitude, rHouseIn)}
            x2={px(p2.longitude, rHouseIn)} y2={py(p2.longitude, rHouseIn)}
            stroke={color}
            strokeWidth={1.1}
            opacity={0.7}
          />
        );
      })}

      {/* Position ticks at the zodiac boundary — A outside, B inside */}
      {planetsA.map((p, i) => (
        <Circle
          key={`dotA${i}`}
          cx={px(p.longitude, rPosDotA)}
          cy={py(p.longitude, rPosDotA)}
          r={1.6}
          fill={A_COLOR}
          opacity={0.6}
        />
      ))}
      {planetsB.map((p, i) => (
        <Circle
          key={`dotB${i}`}
          cx={px(p.longitude, rPosDotB)}
          cy={py(p.longitude, rPosDotB)}
          r={1.6}
          fill={B_COLOR}
          opacity={0.6}
        />
      ))}

      {/* Chart A planet glyphs — outer ring */}
      {planetsA.map((p, i) => {
        const pr = radiiA[p.name] ?? rPlanetA;
        const x  = px(p.longitude, pr);
        const y  = py(p.longitude, pr);
        return (
          <G key={`pA${i}`}>
            <SvgText
              x={x} y={y}
              fill={A_COLOR}
              fontSize={fsPlanet}
              fontWeight="400"
              textAnchor="middle"
              alignmentBaseline="central"
            >
              {p.symbol}
            </SvgText>
          </G>
        );
      })}

      {/* Chart B planet glyphs — inner ring */}
      {planetsB.map((p, i) => {
        const pr = radiiB[p.name] ?? rPlanetB;
        const x  = px(p.longitude, pr);
        const y  = py(p.longitude, pr);
        return (
          <G key={`pB${i}`}>
            <SvgText
              x={x} y={y}
              fill={B_COLOR}
              fontSize={fsPlanet}
              fontWeight="400"
              textAnchor="middle"
              alignmentBaseline="central"
            >
              {p.symbol}
            </SvgText>
          </G>
        );
      })}

      {/* Axis labels from Chart A */}
      {([
        { label: 'ASC', lon: asc,              rot: -90 },
        { label: 'DSC', lon: norm(asc + 180),  rot: -90 },
        { label: 'MC',  lon: mc,               rot: axisLabelRotation(mc) },
        { label: 'IC',  lon: norm(mc + 180),   rot: axisLabelRotation(norm(mc + 180)) },
      ] as const).map(({ label, lon, rot }) => {
        const tx = px(lon, rLabel);
        const ty = py(lon, rLabel);
        return (
          <SvgText
            key={label}
            x={tx} y={ty}
            fill={LABEL_TXT}
            fontSize={fsLabel}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="central"
            transform={`rotate(${rot}, ${f(tx)}, ${f(ty)})`}
          >
            {label}
          </SvgText>
        );
      })}

      {/* A / B markers — small ownership tags near the center so the reader
          knows which ring is which without a separate legend. */}
      <SvgText
        x={cx - baseR * 0.05}
        y={cy + baseR * 0.02}
        fill={A_COLOR}
        fontSize={fsMarker}
        fontWeight="700"
        textAnchor="end"
        alignmentBaseline="central"
      >
        A
      </SvgText>
      <SvgText
        x={cx + baseR * 0.05}
        y={cy + baseR * 0.02}
        fill={B_COLOR}
        fontSize={fsMarker}
        fontWeight="700"
        textAnchor="start"
        alignmentBaseline="central"
      >
        B
      </SvgText>

    </Svg>
  );
}
