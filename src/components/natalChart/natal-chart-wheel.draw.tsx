/**
 * BirthChartWheel.tsx
 * Ultra-minimal wireframe chart wheel.
 *
 * Transparent background · no zodiac band fill · floating sign text
 * White/grey line art only — stroke style encodes aspect type:
 *   Conjunction / Opposition  →  solid white
 *   Square                    →  dotted grey
 *   Trine                     →  long dashes grey
 *   Sextile                   →  short dashes light grey
 *   Minor aspects             →  hidden
 *
 * ASC fixed at 9 o'clock. Longitude increases counter-clockwise.
 */

import { NatalChart, calculateAspects } from '@/src/services/astroEngine';
import React, { useMemo } from 'react';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';


// ─── Palette — all white / light grey for dark background ─────────────────────

const RING          = 'rgba(255,255,255,0.18)';  // outer + inner boundary circles
const SIGN_DIV      = 'rgba(255,255,255,0.12)';  // radial sign dividers
const SIGN_TXT      = '#c0c0d8';                 // floating sign names
const HOUSE_LINE    = 'rgba(99, 97, 97, 0.95)';  // faint house grid
const AXIS_LINE     = 'rgba(255,255,255,0.30)';  // ASC/DSC/MC/IC structural lines
const PLANET_TXT    = '#e8e8f8';                 // planet glyphs (uniform near-white)
const RETRO_TXT     = '#8888a8';                 // retrograde marker
const HNUM_TXT      = 'rgba(255,255,255,0.18)';  // near-invisible house numbers
const LABEL_TXT     = '#a0a0c0';                 // outer axis labels

// ─── Aspect styles ─────────────────────────────────────────────────────────────
// Only Ptolemaic 5 — quincunx and other minors are hidden.

const ASPECT_STYLE: Record<string, { color: string; dash?: string; width: number; baseOp: number }> = {
  Conjunction: { color: '#ffffff', width: 1.0, baseOp: 0.72 },
  Opposition:  { color: '#ffffff', width: 1.0, baseOp: 0.72 },
  Square:      { color: '#b4b4cc', dash: '2 5',  width: 0.70, baseOp: 0.58 },
  Trine:       { color: '#8888a4', dash: '10 6', width: 0.65, baseOp: 0.52 },
  Sextile:     { color: '#6c6c88', dash: '4 4',  width: 0.55, baseOp: 0.44 },
};

const MAJOR_ASPECTS = new Set(['Conjunction', 'Opposition', 'Square', 'Trine', 'Sextile']);

// 10 main planets + lunar nodes
const MAIN_PLANETS = new Set([
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'N. Node', 'S. Node',
]);


// ─── Zodiac ────────────────────────────────────────────────────────────────────

const ZODIAC_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  natalChart: NatalChart;
  size: number;
}

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function midLon(a: number, b: number): number {
  return norm(a + norm(b - a) / 2);
}

export default function BirthChartWheel({ natalChart, size }: Props) {
  const cx = size / 2;
  const cy = size / 2;

  // ── Radii ──────────────────────────────────────────────────────────────
  const baseR      = size * 0.44;
  const rOuter     = baseR;           // outer wheel boundary
  const rZodiacIn  = baseR * 0.76;   // sign zone / planet zone boundary
  const rSignMid   = baseR * 0.88;   // sign text centre
  const rPlanet    = baseR * 0.61;   // planet glyph radius
  const rPosDot    = baseR * 0.755;  // tiny position tick at zone boundary
  const rHouseIn   = baseR * 0.40;   // aspect line inner endpoint
  const rHouseNum  = baseR * 0.355;  // house number labels
  const rLabel     = baseR * 1.07;   // ASC/MC/IC/DSC labels — outside outer ring

  const asc   = natalChart.houses.ascendant;
  const mc    = natalChart.houses.mc;
  const cusps = natalChart.houses.cusps;

  // ── Geometry ───────────────────────────────────────────────────────────

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

  // Axis labels use >= 90 so DSC (exactly 90°) gets flipped to -90°,
  // making all four labels read consistently bottom-to-top.
  function axisLabelRotation(lon: number): number {
    const a = svgA(lon);
    let rot = a * (180 / Math.PI) + 90;
    rot = ((rot % 360) + 360) % 360;
    if (rot > 180) rot -= 360;
    if (rot >= 90)      rot -= 180;
    else if (rot < -90) rot += 180;
    return rot;
  }

  // ── Font sizes ─────────────────────────────────────────────────────────
  const fsSign    = size * 0.023;
  const fsPlanet  = size * 0.042;
  const fsHouseNo = size * 0.018;
  const fsLabel   = size * 0.024;

  // ── Data ───────────────────────────────────────────────────────────────
  const allAspects    = useMemo(() => calculateAspects(natalChart.planets), [natalChart.planets]);
  const aspects       = allAspects.filter(a => MAJOR_ASPECTS.has(a.type));
  const visiblePlanets = natalChart.planets.filter(p => MAIN_PLANETS.has(p.name));

  const planetRadii = useMemo(() => {
    const radii: Record<string, number> = {};
    visiblePlanets.forEach(p => { radii[p.name] = rPlanet; });
    const sorted = [...visiblePlanets].sort((a, b) => a.longitude - b.longitude);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (norm(sorted[j].longitude - sorted[i].longitude) < 8) {
          radii[sorted[j].name] = rPlanet + baseR * 0.09;
        }
      }
    }
    return radii;
  }, [visiblePlanets, rPlanet, baseR]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Svg width={size} height={size}>

      {/* ── Boundary rings (no fill — transparent) ────────────────────── */}
      <Circle cx={cx} cy={cy} r={rOuter}    fill="none" stroke={RING} strokeWidth={0.6} />
      <Circle cx={cx} cy={cy} r={rZodiacIn} fill="none" stroke={RING} strokeWidth={0.4} />

      {/* ── Sign zone: floating names + ultra-thin radial dividers ───────── */}

      {/* Dividers at each 30° sign boundary */}
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

      {/* ── House grid — ultra-faint radial lines ─────────────────────── */}
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

      {/* ASC/DSC axis — full span */}
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

      {/* ── House number labels (near-invisible, structural only) ─────── */}
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

      {/* ══ ASPECT WEB — Ptolemaic 5 only ══════════════════════════════════
           Conjunction / Opposition  →  solid white   (hard / union)
           Square                    →  dotted grey   (tension)
           Trine                     →  long dashes   (flow)
           Sextile                   →  short dashes  (soft opportunity)  */}

      {aspects.map((asp, i) => {
        const p1 = natalChart.planets.find(p => p.name === asp.planet1);
        const p2 = natalChart.planets.find(p => p.name === asp.planet2);
        if (!p1 || !p2) return null;
        const style   = ASPECT_STYLE[asp.type];
        if (!style) return null;
        const opacity = Math.max(0.10, style.baseOp - asp.orb * 0.05);
        return (
          <Line
            key={`asp${i}`}
            x1={px(p1.longitude, rHouseIn)} y1={py(p1.longitude, rHouseIn)}
            x2={px(p2.longitude, rHouseIn)} y2={py(p2.longitude, rHouseIn)}
            stroke={style.color}
            strokeWidth={style.width}
            strokeDasharray={style.dash}
            opacity={opacity}
          />
        );
      })}

      {/* ══ PLANET GLYPHS — 10 main bodies, uniform near-white ═════════════ */}

      {/* Tiny position ticks at the zone boundary */}
      {visiblePlanets.map((p, i) => (
        <Circle
          key={`dot${i}`}
          cx={px(p.longitude, rPosDot)}
          cy={py(p.longitude, rPosDot)}
          r={1.4}
          fill={PLANET_TXT}
          opacity={0.45}
        />
      ))}

      {/* Glyphs */}
      {visiblePlanets.map((p, i) => {
        const pr = planetRadii[p.name] ?? rPlanet;
        const x  = px(p.longitude, pr);
        const y  = py(p.longitude, pr);
        return (
          <G key={`p${i}`}>
            <SvgText
              x={x} y={y}
              fill={PLANET_TXT}
              fontSize={fsPlanet}
              fontWeight="300"
              textAnchor="middle"
              alignmentBaseline="central"
            >
              {p.symbol}
            </SvgText>
            {p.isRetrograde && p.name !== 'N. Node' && p.name !== 'S. Node' && (
              <SvgText
                x={x + fsPlanet * 0.58}
                y={y - fsPlanet * 0.48}
                fill={RETRO_TXT}
                fontSize={fsPlanet * 0.46}
                textAnchor="start"
                alignmentBaseline="baseline"
              >
                ℞
              </SvgText>
            )}
          </G>
        );
      })}

      {/* ── Outer axis labels (ASC / DSC / MC / IC) ─────────────────────── */}
      {/* ASC is always at 9-o'clock, DSC always at 3-o'clock in SVG space.
          Both use -90° so text reads consistently bottom-to-top on each side.
          MC/IC can land anywhere, so they use the computed rotation. */}
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

    </Svg>
  );
}
