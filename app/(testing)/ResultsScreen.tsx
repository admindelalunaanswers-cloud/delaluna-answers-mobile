/**
 * ResultsScreen.tsx
 * Four tabs: Natal / Transits / Moon / Houses
 * Dark cosmic — gold on void.
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from './InputScreen';
import type { PlanetPosition, MoonData, Aspect } from '../utils/astroEngine';
import { calculateAspects } from '../utils/astroEngine';
import { C, S, R } from '../utils/theme';
import BirthChartWheel from '../components/BirthChartWheel';

type Props = NativeStackScreenProps<RootStack, 'Results'>;
type Tab = 'Natal' | 'Transits' | 'Moon' | 'Houses' | 'Chart' | 'Aspects' | 'Table';
const TABS: Tab[] = ['Natal', 'Transits', 'Moon', 'Houses', 'Chart', 'Aspects', 'Table'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZODIAC_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const ZODIAC_SYMS  = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];

function pad(n: number, w = 2) { return String(n).padStart(w, '0'); }
function fDeg(d: number, m: number, s?: number) {
  return s !== undefined ? `${d}°${pad(m)}'${pad(s)}"` : `${d}°${pad(m)}'`;
}
function opp(sign: string): [string, string] {
  const i = (ZODIAC_SIGNS.indexOf(sign) + 6) % 12;
  return [ZODIAC_SIGNS[i], ZODIAC_SYMS[i]];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SecHead({ title, icon }: { title: string; icon?: string }) {
  return (
    <View style={ss.secHead}>
      {icon ? <Text style={ss.secIcon}>{icon}</Text> : null}
      <Text style={ss.secTitle}>{title}</Text>
      <View style={ss.secLine} />
    </View>
  );
}

function PlanetRow({ p }: { p: PlanetPosition }) {
  const planetColor = C.planet[p.name] ?? C.muted;
  return (
    <View style={[ss.pRow, p.isRetrograde && ss.pRowRetro]}>
      {/* Left: symbol + name */}
      <View style={ss.pLeft}>
        <Text style={[ss.pSymbol, { color: planetColor }]}>{p.symbol}</Text>
        <View>
          <Text style={ss.pName}>{p.name}</Text>
          {p.isRetrograde && <Text style={ss.pRetroTag}>℞ Retrograde</Text>}
        </View>
      </View>
      {/* Right: sign + degree + house */}
      <View style={ss.pRight}>
        <Text style={ss.pSign}>{p.signSymbol} {p.sign}</Text>
        <Text style={ss.pDeg}>{fDeg(p.degree, p.minutes)}</Text>
        <View style={ss.housePill}>
          <Text style={ss.housePillText}>H{p.house}</Text>
        </View>
      </View>
    </View>
  );
}

function MoonCard({ moon, label }: { moon: MoonData; label: string }) {
  return (
    <View style={ss.moonCard}>
      {/* Header */}
      <View style={ss.moonHead}>
        <Text style={ss.moonEmoji}>{moon.phaseEmoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={ss.moonLabel}>{label}</Text>
          <Text style={ss.moonPhase}>{moon.phase}</Text>
        </View>
        {moon.isRetrograde && <Text style={ss.retroTag}>℞</Text>}
      </View>

      {/* Stat grid */}
      <View style={ss.statGrid}>
        {([
          ['SIGN',          `${moon.signSymbol} ${moon.sign}`],
          ['DEGREE',        fDeg(moon.degree, moon.minutes)],
          ['☉∠☽ ANGLE',   `${moon.sunMoonAngle.toFixed(2)}°`],
          ['ILLUMINATION',  `${moon.illumination}%`],
          ['LONGITUDE',     `${moon.longitude.toFixed(4)}°`],
          ['MOTION',        moon.isRetrograde ? '℞ Retro' : '▷ Direct'],
        ] as [string, string][]).map(([k, v]) => (
          <View key={k} style={ss.statCell}>
            <Text style={ss.statKey}>{k}</Text>
            <Text style={[ss.statVal, k === 'MOTION' && moon.isRetrograde && { color: C.retro }]}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Illumination bar */}
      <View style={ss.illumTrack}>
        <View style={[ss.illumFill, { width: `${Number.isFinite(moon.illumination) ? moon.illumination : 0}%` as any }]} />
      </View>
    </View>
  );
}

function TableRow({ k, v, alt, accent }: { k: string; v: string; alt?: boolean; accent?: boolean }) {
  return (
    <View style={[ss.tableRow, alt && ss.tableAlt]}>
      <Text style={ss.tableKey}>{k}</Text>
      <Text style={[ss.tableVal, accent && { color: C.retro }]}>{v}</Text>
    </View>
  );
}

const ASPECT_COLORS: Record<string, string> = {
  harmonious:  '#70a060',
  challenging: '#e05050',
  neutral:     '#d4a853',
  minor:       '#9098b8',
};

function AspectRow({ a }: { a: Aspect }) {
  const color = ASPECT_COLORS[a.nature];
  const orbDeg = Math.floor(a.orb);
  const orbMin = Math.floor((a.orb % 1) * 60);
  return (
    <View style={ss.aspectRow}>
      <View style={ss.aspectPlanets}>
        <Text style={[ss.aspectPSym, { color: C.planet[a.planet1] ?? C.muted }]}>{a.symbol1}</Text>
        <Text style={[ss.aspectSym, { color }]}>{a.aspectSymbol}</Text>
        <Text style={[ss.aspectPSym, { color: C.planet[a.planet2] ?? C.muted }]}>{a.symbol2}</Text>
      </View>
      <View style={ss.aspectMid}>
        <Text style={[ss.aspectType, { color }]}>{a.type}</Text>
        <Text style={ss.aspectNames}>{a.planet1} · {a.planet2}</Text>
      </View>
      <Text style={ss.aspectOrb}>{orbDeg}°{String(orbMin).padStart(2, '0')}'</Text>
    </View>
  );
}

function NatalTable({ planets, asc, mc }: {
  planets: PlanetPosition[];
  asc: { sign: string; signSymbol: string; degree: number; minutes: number };
  mc:  { sign: string; signSymbol: string; degree: number; minutes: number };
}) {
  return (
    <View style={ss.ntWrap}>
      {/* Header */}
      <View style={ss.ntHeaderRow}>
        <View style={ss.ntSymCol} />
        <Text style={[ss.ntHdr, { width: 64 }]}>PLANET</Text>
        <Text style={[ss.ntHdr, { flex: 1 }]}>SIGN</Text>
        <Text style={[ss.ntHdr, { width: 60, textAlign: 'right' }]}>DEGREE</Text>
        <Text style={[ss.ntHdr, { width: 26, textAlign: 'right' }]}>H</Text>
      </View>
      {/* Planet rows */}
      {planets.map((p, i) => (
        <View key={i} style={[ss.ntRow, i % 2 === 0 && ss.ntRowAlt]}>
          <Text style={[ss.ntSym, { color: C.planet[p.name] ?? C.muted }]}>{p.symbol}</Text>
          <Text style={ss.ntName}>{p.name}</Text>
          <Text style={ss.ntSign}>{p.signSymbol} {p.sign}</Text>
          <Text style={[ss.ntDeg, p.isRetrograde && { color: C.retro }]}>
            {p.degree}°{pad(p.minutes)}'{p.isRetrograde ? ' ℞' : ''}
          </Text>
          <Text style={ss.ntHouse}>H{p.house}</Text>
        </View>
      ))}
      {/* Angles */}
      <View style={ss.ntDivider} />
      {([
        { label: 'ASC', color: C.goldBright, ...asc },
        { label: 'MC',  color: C.muted,      ...mc  },
      ] as const).map(({ label, color, sign, signSymbol, degree, minutes }, i) => (
        <View key={label} style={[ss.ntRow, i % 2 === 0 && ss.ntRowAlt]}>
          <Text style={[ss.ntSym, { color }]}>⊹</Text>
          <Text style={ss.ntName}>{label}</Text>
          <Text style={ss.ntSign}>{signSymbol} {sign}</Text>
          <Text style={ss.ntDeg}>{degree}°{pad(minutes)}'</Text>
          <Text style={ss.ntHouse} />
        </View>
      ))}
    </View>
  );
}

// ─── Editorial Vertical-Split Table ──────────────────────────────────────────

function EditorialTable({ planets, asc }: {
  planets: PlanetPosition[];
  asc: { sign: string; signSymbol: string; degree: number; minutes: number };
}) {
  type Row = {
    sign: string; symbol: string; name: string;
    house: number; retrograde: boolean; color: string;
  };

  const rows: Row[] = [
    { sign: asc.sign, symbol: '↑', name: 'ASCENDANT', house: 1, retrograde: false, color: C.goldBright },
    ...planets.map(p => ({
      sign: p.sign, symbol: p.symbol, name: p.name.toUpperCase(),
      house: p.house, retrograde: p.isRetrograde, color: C.planet[p.name] ?? C.muted,
    })),
  ].sort((a, b) => a.house - b.house);

  const annotated = rows.map((r, i) => ({
    ...r,
    showSign: i === 0 || rows[i - 1].sign !== r.sign,
    lastInGroup: i === rows.length - 1 || rows[i + 1].sign !== r.sign,
  }));

  return (
    <View style={et.wrap}>
      {/* Column headers */}
      <View style={et.headerRow}>
        <View style={et.signCol}><Text style={et.hdr}>SIGNS</Text></View>
        <View style={et.planetCol}><Text style={et.hdr}>PLANETS</Text></View>
        <View style={et.houseCol}><Text style={[et.hdr, et.hdrRight]}>HOUSES</Text></View>
      </View>

      {/* Data rows */}
      {annotated.map((row, i) => (
        <View key={i} style={[et.row, row.lastInGroup && et.rowGroupEnd]}>
          <View style={et.signCol}>
            {row.showSign && <Text style={et.signName}>{row.sign}</Text>}
          </View>
          <View style={et.planetCol}>
            <Text style={[et.pSym, { color: row.color }]}>{row.symbol}</Text>
            <Text style={[et.pName, row.retrograde && { color: C.retro }]}>
              {row.name}{row.retrograde ? '  ℞' : ''}
            </Text>
          </View>
          <View style={et.houseCol}>
            <Text style={et.houseNum}>{row.house}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ResultsScreen({ route, navigation }: Props) {
  const { natalChart, transits, transitDate, name, birthData } = route.params;
  const [tab, setTab] = useState<Tab>('Natal');
  const { width } = useWindowDimensions();
  const wheelSize = width - S.md * 2;

  const retros  = transits.planets.filter(p => p.isRetrograde);

  const fBirth = [
    `${birthData.year}/${pad(birthData.month)}/${pad(birthData.day)}`,
    `${pad(birthData.hour)}:${pad(birthData.minute)}`,
    `${birthData.lat.toFixed(2)}, ${birthData.lon.toFixed(2)}`,
  ].join('  ·  ');

  return (
    <SafeAreaView style={ss.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.cosmos} />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={ss.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
          <Text style={ss.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={ss.chartName}>{name}</Text>
          <Text style={ss.chartMeta} numberOfLines={1}>{fBirth}</Text>
        </View>
        <TouchableOpacity
          style={ss.compareBtn}
          onPress={() => navigation.navigate('Synastry', { chartA: natalChart, nameA: name })}
        >
          <Text style={ss.compareBtnText}>♡</Text>
        </TouchableOpacity>
      </View>

      {/* ── Quick-glance strip ──────────────────────────────────────────── */}
      <View style={ss.strip}>
        {((): [string, string][] => {
          const sun = natalChart.planets.find(p => p.name === 'Sun');
          return [
            ['RISING', `${natalChart.ascendant.signSymbol} ${natalChart.ascendant.sign} ${natalChart.ascendant.degree}°`],
            ['☽ MOON',  `${natalChart.moon.phaseEmoji} ${natalChart.moon.sign}`],
            ['☉ SUN',   sun ? `${sun.signSymbol} ${sun.sign} ${sun.degree}°` : '—'],
          ];
        })().map(([k, v]) => (
          <View key={k} style={ss.stripItem}>
            <Text style={ss.stripKey}>{k}</Text>
            <Text style={ss.stripVal}>{v}</Text>
          </View>
        ))}
      </View>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <View style={ss.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[ss.tabItem, tab === t && ss.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[ss.tabText, tab === t && ss.tabTextActive]}>{t}</Text>
            {t === 'Transits' && retros.length > 0 && (
              <View style={ss.retroBadge}>
                <Text style={ss.retroBadgeText}>{retros.length}℞</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={ss.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ══ NATAL ══════════════════════════════════════════════════════ */}
        {tab === 'Natal' && (
          <>
            <SecHead title="NATAL PLANETS" icon="☉" />
            <View style={ss.planetList}>
              {natalChart.planets.map((p, i) => <PlanetRow key={i} p={p} />)}
            </View>

            <SecHead title="NATAL MOON" icon="☽" />
            <MoonCard moon={natalChart.moon} label="Birth Moon" />

            <SecHead title="CHART ANGLES" icon="⊹" />
            <View style={ss.card}>
              <TableRow k="Ascendant  (ASC)" v={`${natalChart.ascendant.signSymbol} ${natalChart.ascendant.sign}  ${fDeg(natalChart.ascendant.degree, natalChart.ascendant.minutes)}`} />
              <TableRow k="Midheaven  (MC)"  v={`${natalChart.midheaven.signSymbol} ${natalChart.midheaven.sign}  ${fDeg(natalChart.midheaven.degree, natalChart.midheaven.minutes)}`} alt />
              <TableRow k="Descendant (DSC)" v={`${opp(natalChart.ascendant.sign)[1]} ${opp(natalChart.ascendant.sign)[0]}  ${fDeg(natalChart.ascendant.degree, natalChart.ascendant.minutes)}`} />
            </View>
          </>
        )}

        {/* ══ TRANSITS ═══════════════════════════════════════════════════ */}
        {tab === 'Transits' && (
          <>
            <Text style={ss.transitDateLine}>
              Sky for {new Date(transitDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{' '}
              at {new Date(transitDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </Text>

            {retros.length > 0 && (
              <>
                <SecHead title={`RETROGRADES  (${retros.length})`} icon="℞" />
                <View style={ss.retroBanner}>
                  <Text style={ss.retroBannerText}>
                    {retros.map(p => `${p.symbol} ${p.name}`).join('   ·   ')}
                  </Text>
                </View>
              </>
            )}

            <SecHead title="ALL TRANSITING PLANETS" icon="✦" />
            <View style={ss.planetList}>
              {transits.planets.map((p, i) => <PlanetRow key={i} p={p} />)}
            </View>
          </>
        )}

        {/* ══ MOON ═══════════════════════════════════════════════════════ */}
        {tab === 'Moon' && (
          <>
            <SecHead title="NATAL MOON" icon="🌙" />
            <MoonCard moon={natalChart.moon} label="Birth Moon" />

            <SecHead title="TODAY'S MOON" icon="🔭" />
            <Text style={ss.transitDateLine}>
              {new Date(transitDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              {'  ·  '}
              {new Date(transitDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </Text>
            <MoonCard moon={transits.moon} label="Current Moon" />

            <SecHead title="CURRENT MOON — FULL DETAILS" icon="✦" />
            <View style={ss.card}>
              {([
                ['Sign',           `${transits.moon.signSymbol} ${transits.moon.sign}`],
                ['Phase',          `${transits.moon.phaseEmoji} ${transits.moon.phase}`],
                ['Degree',         fDeg(transits.moon.degree, transits.moon.minutes)],
                ['Ecliptic Lon.',  `${transits.moon.longitude.toFixed(4)}°`],
                ['Sun∠Moon',       `${transits.moon.sunMoonAngle.toFixed(2)}°`],
                ['Illumination',   `${transits.moon.illumination}%`],
                ['Motion',         transits.moon.isRetrograde ? '℞ Retrograde' : '▷ Direct'],
              ] as [string, string][]).map(([k, v], i) => (
                <TableRow key={k} k={k} v={v} alt={i % 2 !== 0}
                  accent={k === 'Motion' && transits.moon.isRetrograde} />
              ))}
            </View>
          </>
        )}

        {/* ══ CHART ══════════════════════════════════════════════════════ */}
        {tab === 'Chart' && (
          <>
            <SecHead title="NATAL CHART WHEEL" icon="⊹" />
            <View style={{ alignItems: 'center', marginBottom: S.md }}>
              <BirthChartWheel natalChart={natalChart} size={wheelSize} />
            </View>
            <SecHead title="NATAL TABLE" icon="☉" />
            <NatalTable
              planets={natalChart.planets}
              asc={natalChart.ascendant}
              mc={natalChart.midheaven}
            />
          </>
        )}

        {/* ══ ASPECTS ════════════════════════════════════════════════════ */}
        {tab === 'Aspects' && (
          <>
            <SecHead title="NATAL ASPECTS" icon="✶" />
            <View style={ss.aspectLegend}>
              {[['☌','neutral'],['⚹','harmonious'],['□','challenging'],['△','harmonious'],['⚻','minor'],['☍','challenging']].map(([sym, nat]) => (
                <Text key={sym} style={[ss.legendItem, { color: ASPECT_COLORS[nat] }]}>{sym}</Text>
              ))}
            </View>
            <View style={ss.aspectList}>
              {calculateAspects(natalChart.planets).map((a, i) => (
                <AspectRow key={i} a={a} />
              ))}
            </View>
          </>
        )}

        {/* ══ TABLE ══════════════════════════════════════════════════════ */}
        {tab === 'Table' && (
          <>
            <SecHead title="NATAL CHART  ·  VERTICAL SPLIT" icon="☉" />
            <EditorialTable planets={natalChart.planets} asc={natalChart.ascendant} />
          </>
        )}

        {/* ══ HOUSES ═════════════════════════════════════════════════════ */}
        {tab === 'Houses' && (
          <>
            <SecHead title="HOUSE CUSPS  ·  PLACIDUS" icon="⌂" />
            <View style={ss.houseGrid}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
                const lon = natalChart.houses.cusps[h] ?? 0;
                const idx = Math.floor(((lon % 360) + 360) % 360 / 30);
                const rem = ((lon % 360) + 360) % 360 - idx * 30;
                const d   = Math.floor(rem);
                const m   = Math.floor((rem % 1) * 60);
                return (
                  <View key={h} style={ss.houseCell}>
                    <Text style={ss.houseCellNum}>H{h}</Text>
                    <Text style={ss.houseCellSign}>{ZODIAC_SYMS[idx]} {ZODIAC_SIGNS[idx].slice(0, 3)}</Text>
                    <Text style={ss.houseCellDeg}>{d}°{pad(m)}'</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: S.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cosmos },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  backBtn:  { width: 40 },
  backArrow:{ color: C.gold, fontSize: 22 },
  chartName:{ color: C.goldBright, fontSize: 18, fontWeight: '700', fontFamily: 'serif', letterSpacing: 1 },
  chartMeta:{ color: C.nebulaTeal, fontSize: 10, marginTop: 2, letterSpacing: 0.5 },

  strip: {
    flexDirection: 'row', backgroundColor: C.nebula,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
    paddingVertical: S.sm,
  },
  stripItem:{ flex: 1, alignItems: 'center' },
  stripKey: { color: C.dimText, fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  stripVal: { color: C.goldBright, fontSize: 12, fontWeight: '600', marginTop: 2 },

  tabBar: {
    flexDirection: 'row', backgroundColor: C.nebula,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: S.sm + 2,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    flexDirection: 'row', justifyContent: 'center', gap: 4,
  },
  tabItemActive: { borderBottomColor: C.gold },
  tabText:       { color: C.dimText, fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: C.goldBright },
  retroBadge: {
    backgroundColor: C.retro,
    borderRadius: R.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  retroBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  content: { paddingHorizontal: S.md, paddingTop: S.sm },

  secHead: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: S.md, marginBottom: S.sm,
  },
  secIcon:  { color: C.gold, fontSize: 13, marginRight: 6 },
  secTitle: { color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2.5 },
  secLine:  { flex: 1, height: 1, backgroundColor: C.starfield, marginLeft: S.sm },

  planetList: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    overflow: 'hidden',
    marginBottom: S.sm,
  },
  pRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.md, paddingVertical: S.sm + 1,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  pRowRetro: { backgroundColor: C.retroBg },
  pLeft:     { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pSymbol:   { fontSize: 20, width: 30, textAlign: 'center', marginRight: S.sm },
  pName:     { color: C.white, fontSize: 13, fontWeight: '600' },
  pRetroTag: { color: C.retro, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  pRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pSign:     { color: C.purpleLight, fontSize: 12, fontWeight: '600', minWidth: 88, textAlign: 'right' },
  pDeg:      { color: C.moonSilver, fontSize: 11, minWidth: 56, textAlign: 'right' },
  housePill: {
    backgroundColor: C.deepSpace,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.starfield,
    paddingHorizontal: 5, paddingVertical: 2, minWidth: 26, alignItems: 'center',
  },
  housePillText: { color: C.goldDim, fontSize: 9, fontWeight: '800' },

  moonCard: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    padding: S.md,
    marginBottom: S.sm,
  },
  moonHead:  { flexDirection: 'row', alignItems: 'center', marginBottom: S.sm },
  moonEmoji: { fontSize: 38, marginRight: S.md },
  moonLabel: { color: C.dimText, fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  moonPhase: { color: C.white, fontSize: 17, fontWeight: '600' },
  retroTag:  { color: C.retro, fontSize: 15, fontWeight: '800' },

  statGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  statCell:  {
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    padding: S.sm,
    minWidth: '46%',
    flex: 1,
  },
  statKey: { color: C.dimText, fontSize: 8, fontWeight: '800', letterSpacing: 2, marginBottom: 3 },
  statVal: { color: C.white, fontSize: 13, fontWeight: '600' },

  illumTrack: { height: 3, backgroundColor: C.deepSpace, borderRadius: R.pill, overflow: 'hidden' },
  illumFill:  { height: 3, backgroundColor: C.moonSilver, borderRadius: R.pill },

  transitDateLine: {
    color: C.nebulaTeal, fontSize: 11, textAlign: 'center',
    fontStyle: 'italic', marginBottom: S.sm,
  },
  retroBanner: {
    backgroundColor: C.retroBg,
    borderWidth: 1, borderColor: C.retro,
    borderRadius: R.md,
    padding: S.sm + 2,
    marginBottom: S.sm,
    alignItems: 'center',
  },
  retroBannerText: { color: C.retro, fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  card: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    overflow: 'hidden',
    marginBottom: S.sm,
  },
  tableRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: S.md, paddingVertical: S.sm + 2,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  tableAlt: { backgroundColor: `${C.deepSpace}99` },
  tableKey: { color: C.nebulaTeal, fontSize: 12 },
  tableVal: { color: C.white, fontSize: 12, fontWeight: '600' },

  houseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  houseCell: {
    backgroundColor: C.nebula,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    padding: S.sm,
    width: '30%',
    alignItems: 'center',
    flex: 1,
    minWidth: 90,
  },
  houseCellNum:  { color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  houseCellSign: { color: C.white, fontSize: 12, fontWeight: '600', marginTop: 2 },
  houseCellDeg:  { color: C.muted, fontSize: 10, marginTop: 1 },

  aspectLegend: {
    flexDirection: 'row', justifyContent: 'center', gap: S.lg,
    paddingVertical: S.xs, marginBottom: S.sm,
  },
  legendItem: { fontSize: 18, fontWeight: '700' },

  aspectList: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    overflow: 'hidden',
    marginBottom: S.sm,
  },
  aspectRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.md, paddingVertical: S.sm + 1,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  aspectPlanets: { flexDirection: 'row', alignItems: 'center', width: 68, gap: 2 },
  aspectPSym:    { fontSize: 18, width: 22, textAlign: 'center' },
  aspectSym:     { fontSize: 15, width: 20, textAlign: 'center', fontWeight: '700' },
  aspectMid:     { flex: 1, paddingHorizontal: S.sm },
  aspectType:    { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  aspectNames:   { color: C.dimText, fontSize: 10, marginTop: 1 },
  aspectOrb:     { color: C.moonSilver, fontSize: 11, minWidth: 40, textAlign: 'right' },

  ntWrap: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    overflow: 'hidden',
    marginBottom: S.sm,
  },
  ntHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.md, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: C.gold,
    backgroundColor: C.deepSpace,
  },
  ntSymCol: { width: 26 },
  ntHdr:    { color: C.dimText, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  ntRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.md, paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  ntRowAlt: { backgroundColor: `${C.deepSpace}99` },
  ntSym:    { fontSize: 15, width: 26, textAlign: 'center' },
  ntName:   { color: C.muted, fontSize: 11, width: 64 },
  ntSign:   { color: C.purpleLight, fontSize: 11, fontWeight: '600', flex: 1 },
  ntDeg:    { color: C.moonSilver, fontSize: 11, width: 60, textAlign: 'right' },
  ntHouse:  { color: C.goldDim, fontSize: 10, fontWeight: '800', width: 26, textAlign: 'right' },
  ntDivider:{ height: 1, backgroundColor: C.goldMid, opacity: 0.4 },

  compareBtn: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  compareBtnText: { color: C.purpleLight, fontSize: 22 },
});

// ─── Editorial Table Styles ───────────────────────────────────────────────────

const et = StyleSheet.create({
  wrap: {
    marginBottom: S.sm,
    overflow: 'hidden',
  },

  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.starfield,
    paddingBottom: S.sm,
    marginBottom: 2,
  },
  hdr: {
    color: C.dimText,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  hdrRight: { textAlign: 'right' },

  row: {
    flexDirection: 'row',
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: `${C.starfield}55`,
  },
  rowGroupEnd: {
    borderBottomColor: C.starfield,
    paddingBottom: S.md + S.sm,
  },

  // Columns — borders act as the persistent vertical dividers
  signCol: {
    width: 130,
    paddingRight: S.md,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: C.starfield,
  },
  planetCol: {
    flex: 1,
    paddingHorizontal: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRightWidth: 1,
    borderRightColor: C.starfield,
  },
  houseCol: {
    width: 64,
    paddingLeft: S.sm,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },

  signName: {
    color: C.white,
    fontSize: 17,
    fontWeight: '400',
    fontFamily: 'serif',
    letterSpacing: 0.3,
  },
  pSym: {
    fontSize: 16,
  },
  pName: {
    color: C.moonSilver,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  houseNum: {
    color: C.goldBright,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
});
