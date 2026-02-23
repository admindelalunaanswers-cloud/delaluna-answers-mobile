/**
 * SynastryScreen.tsx
 * Enter Person B's birth data, calculate synastry aspects against Person A's natal chart.
 * Dark cosmic aesthetic — consistent with InputScreen / ResultsScreen.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from './InputScreen';
import {
  calculateNatalChart, calculateSynastry,
  BirthData, NatalChart, Aspect,
} from '../utils/astroEngine';
import { C, S, R } from '../utils/theme';

type Props = NativeStackScreenProps<RootStack, 'Synastry'>;

type NominatimResult = {
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

function hasCity(r: NominatimResult): boolean {
  const a = r.address;
  return !!(a.city ?? a.town ?? a.village ?? a.municipality);
}

function formatPlace(r: NominatimResult): string {
  const a = r.address;
  const place = a.city ?? a.town ?? a.village ?? a.municipality;
  return [place, a.state, a.country].filter(Boolean).join(', ') || r.display_name;
}

// Key synastry pairs — shown in a highlighted section before the full list
const KEY_PAIRS = new Set([
  'Sun|Moon', 'Moon|Sun',
  'Sun|Venus', 'Venus|Sun',
  'Sun|Sun',
  'Moon|Moon',
  'Venus|Mars', 'Mars|Venus',
  'Moon|Venus', 'Venus|Moon',
  'Sun|Jupiter', 'Jupiter|Sun',
  'Mercury|Mercury',
]);

function pairKey(a: string, b: string) { return `${a}|${b}`; }

function isKeyPair(a: Aspect) {
  return KEY_PAIRS.has(pairKey(a.planet1, a.planet2));
}

// Duplicate of InputScreen's getUtcOffsetHours (small function, avoids shared-util overhead)
function getUtcOffsetHours(ianaTimezone: string, date: Date): number {
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
  if (h === 24) h = 0;
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'));
  return Math.round((localMs - date.getTime()) / 900000) * 0.25;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

const ASPECT_COLORS: Record<string, string> = {
  harmonious:  '#70a060',
  challenging: '#e05050',
  neutral:     '#d4a853',
  minor:       '#9098b8',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SynAspectRow({ a, highlighted }: { a: Aspect; highlighted?: boolean }) {
  const color  = ASPECT_COLORS[a.nature];
  const orbDeg = Math.floor(a.orb);
  const orbMin = Math.floor((a.orb % 1) * 60);
  return (
    <View style={[sc.aspectRow, highlighted && sc.aspectRowHL]}>
      <View style={sc.aspectPlanets}>
        <Text style={[sc.aspectPSym, { color: C.planet[a.planet1] ?? C.muted }]}>{a.symbol1}</Text>
        <Text style={[sc.aspectSym, { color }]}>{a.aspectSymbol}</Text>
        <Text style={[sc.aspectPSym, { color: C.planet[a.planet2] ?? C.muted }]}>{a.symbol2}</Text>
      </View>
      <View style={sc.aspectMid}>
        <Text style={[sc.aspectType, { color }]}>{a.type}</Text>
        <Text style={sc.aspectNames}>{a.planet1} · {a.planet2}</Text>
      </View>
      <Text style={sc.aspectOrb}>{orbDeg}°{pad(orbMin)}'</Text>
    </View>
  );
}

function SecHead({ title, icon }: { title: string; icon?: string }) {
  return (
    <View style={sc.secHead}>
      {icon ? <Text style={sc.secIcon}>{icon}</Text> : null}
      <Text style={sc.secTitle}>{title}</Text>
      <View style={sc.secLine} />
    </View>
  );
}

function FieldLabel({ t }: { t: string }) {
  return <Text style={sc.fieldLabel}>{t}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={sc.card}>{children}</View>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SynastryScreen({ route, navigation }: Props) {
  const { chartA, nameA } = route.params;

  // Step: 'input' shows the form, 'results' shows aspects
  const [step, setStep] = useState<'input' | 'results'>('input');

  // Person B form state
  const [nameB,            setNameB]            = useState('');
  const [birthDate,        setBirthDate]        = useState(new Date(1990, 0, 15, 12, 0));
  const [lat,              setLat]              = useState('');
  const [lon,              setLon]              = useState('');
  const [city,             setCity]             = useState('');
  const [tzValue,          setTzValue]          = useState(0);
  const [tzDisplay,        setTzDisplay]        = useState('');
  const [showDate,         setShowDate]         = useState(false);
  const [showTime,         setShowTime]         = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [locationResults,  setLocationResults]  = useState<NominatimResult[]>([]);
  const [locationSearching,setLocationSearching]= useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Results
  const [chartB,   setChartB]   = useState<NatalChart | null>(null);
  const [aspects,  setAspects]  = useState<Aspect[]>([]);

  // ── Date pickers ──────────────────────────────────────────────────────────

  const onPickDate = (_: DateTimePickerEvent, d?: Date) => {
    setShowDate(false);
    if (!d) return;
    setBirthDate(prev => {
      const next = new Date(d);
      next.setHours(prev.getHours(), prev.getMinutes());
      return next;
    });
  };

  const onPickTime = (_: DateTimePickerEvent, d?: Date) => {
    setShowTime(false);
    if (!d) return;
    setBirthDate(prev => {
      const next = new Date(prev);
      next.setHours(d.getHours(), d.getMinutes());
      return next;
    });
  };

  // ── Location search ───────────────────────────────────────────────────────

  const searchLocation = useCallback(async (query: string) => {
    setLocationSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'AstroNatal/1.0' } }
      );
      if (!resp.ok) throw new Error();
      const all = await resp.json() as NominatimResult[];
      const seen = new Set<string>();
      setLocationResults(
        all.filter(r => {
          if (!hasCity(r)) return false;
          const label = formatPlace(r);
          if (seen.has(label)) return false;
          seen.add(label);
          return true;
        })
      );
    } catch {
      setLocationResults([]);
    } finally {
      setLocationSearching(false);
    }
  }, []);

  const onCityChange = useCallback((text: string) => {
    setCity(text);
    setLat(''); setLon(''); setTzValue(0); setTzDisplay('');
    setLocationResults([]);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length >= 2) {
      searchTimer.current = setTimeout(() => searchLocation(text), 600);
    }
  }, [searchLocation]);

  const selectLocation = useCallback((r: NominatimResult) => {
    setCity(formatPlace(r));
    setLat(r.lat);
    setLon(r.lon);
    setLocationResults([]);
  }, []);

  // ── Timezone detection ────────────────────────────────────────────────────

  const detectTimezone = useCallback(async (latNum: number, lonNum: number) => {
    try {
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&timezone=auto&current=temperature_2m`
      );
      if (!resp.ok) return;
      const data = await resp.json() as { timezone?: string; utc_offset_seconds?: number };
      const tzName = data.timezone;
      if (!tzName) return;

      const refDate = new Date(Date.UTC(
        birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate(), 12, 0, 0
      ));
      let offset: number;
      try {
        offset = getUtcOffsetHours(tzName, refDate);
      } catch {
        offset = Math.round(((data.utc_offset_seconds ?? 0) / 3600) * 4) / 4;
      }

      setTzValue(offset);
      const sign  = offset >= 0 ? '+' : '−';
      const absH  = Math.floor(Math.abs(offset));
      const absM  = Math.round((Math.abs(offset) % 1) * 60);
      const oStr  = absM ? `UTC${sign}${absH}:${String(absM).padStart(2, '0')}` : `UTC${sign}${absH}`;
      setTzDisplay(`${tzName}  ·  ${oStr}`);
    } catch { /* silent */ }
  }, [birthDate]);

  useEffect(() => {
    if (!lat || !lon) return;
    const la = parseFloat(lat), lo = parseFloat(lon);
    if (isNaN(la) || isNaN(lo)) return;
    detectTimezone(la, lo);
  }, [birthDate, lat, lon, detectTimezone]);

  // ── Calculate ─────────────────────────────────────────────────────────────

  const handleCalculate = useCallback(async () => {
    if (!nameB.trim()) {
      Alert.alert('Name required', 'Enter a name for Person B.');
      return;
    }
    const latNum = parseFloat(lat.replace(',', '.'));
    const lonNum = parseFloat(lon.replace(',', '.'));
    if (isNaN(latNum) || isNaN(lonNum)) {
      Alert.alert('Location required', 'Search and select a birth location.');
      return;
    }

    setLoading(true);
    try {
      const bd: BirthData = {
        year:     birthDate.getFullYear(),
        month:    birthDate.getMonth() + 1,
        day:      birthDate.getDate(),
        hour:     birthDate.getHours(),
        minute:   birthDate.getMinutes(),
        lat:      latNum,
        lon:      lonNum,
        timezone: tzValue,
      };
      const chart = await calculateNatalChart(bd);
      const syn   = calculateSynastry(chartA.planets, chart.planets);
      setChartB(chart);
      setAspects(syn);
      setStep('results');
    } catch (e: any) {
      Alert.alert('Calculation Error', e?.message ?? 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [nameB, birthDate, lat, lon, tzValue, chartA]);

  // ── Format helpers ─────────────────────────────────────────────────────────

  const fDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const fTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const sunA = chartA.planets.find(p => p.name === 'Sun');

  // ── Render ─────────────────────────────────────────────────────────────────

  // Results-page derived data
  const keyAspects   = aspects.filter(isKeyPair);
  const otherAspects = aspects.filter(a => !isKeyPair(a));
  const harmonious   = aspects.filter(a => a.nature === 'harmonious').length;
  const challenging  = aspects.filter(a => a.nature === 'challenging').length;
  const neutral      = aspects.filter(a => a.nature === 'neutral').length;

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.cosmos} />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={sc.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={sc.backBtn}>
          <Text style={sc.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={sc.screenTitle}>SYNASTRY</Text>
          <Text style={sc.screenSub}>
            {nameA}{step === 'results' && nameB ? `  ♡  ${nameB}` : ''}
          </Text>
        </View>
        {step === 'results' && (
          <TouchableOpacity onPress={() => setStep('input')} style={sc.editBtn}>
            <Text style={sc.editBtnText}>Edit</Text>
          </TouchableOpacity>
        )}
        {step === 'input' && <View style={{ width: 48 }} />}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={sc.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Person A reference strip ──────────────────────────────────── */}
        <View style={sc.personAStrip}>
          <Text style={sc.personALabel}>PERSON A</Text>
          <Text style={sc.personAName}>{nameA}</Text>
          {sunA && (
            <Text style={sc.personAMeta}>
              {sunA.signSymbol} {sunA.sign}  ·  {chartA.ascendant.signSymbol} {chartA.ascendant.sign} Rising
            </Text>
          )}
        </View>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'input' ? (
          <>
            {/* ── Person B divider ─────────────────────────────────────── */}
            <View style={sc.personBDivider}>
              <View style={sc.personBLine} />
              <Text style={sc.personBTag}>PERSON B</Text>
              <View style={sc.personBLine} />
            </View>

            {/* Name */}
            <Card>
              <FieldLabel t="NAME" />
              <TextInput
                style={sc.textBox}
                value={nameB}
                onChangeText={setNameB}
                placeholder="Person B name…"
                placeholderTextColor={C.dimText}
                selectionColor={C.gold}
                autoCorrect={false}
              />
            </Card>

            {/* Birth date & time */}
            <Card>
              <FieldLabel t="BIRTH DATE & TIME" />
              <View style={sc.row}>
                <TouchableOpacity style={[sc.pillBtn, { flex: 3 }]} onPress={() => setShowDate(true)}>
                  <Text style={sc.pillIcon}>📅</Text>
                  <Text style={sc.pillText}>{fDate(birthDate)}</Text>
                </TouchableOpacity>
                <View style={{ width: S.sm }} />
                <TouchableOpacity style={[sc.pillBtn, { flex: 2 }]} onPress={() => setShowTime(true)}>
                  <Text style={sc.pillIcon}>🕐</Text>
                  <Text style={sc.pillText}>{fTime(birthDate)}</Text>
                </TouchableOpacity>
              </View>
              {showDate && (
                <DateTimePicker
                  value={birthDate} mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark" maximumDate={new Date()}
                  onChange={onPickDate}
                />
              )}
              {showTime && (
                <DateTimePicker
                  value={birthDate} mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark"
                  onChange={onPickTime}
                />
              )}
            </Card>

            {/* Location */}
            <Card>
              <FieldLabel t="BIRTH LOCATION" />
              <View style={sc.locationSearchRow}>
                <TextInput
                  style={[sc.textBox, sc.locationInput]}
                  value={city}
                  onChangeText={onCityChange}
                  placeholder="Search city or place…"
                  placeholderTextColor={C.dimText}
                  selectionColor={C.gold}
                  autoCorrect={false}
                />
                {locationSearching && (
                  <ActivityIndicator style={{ marginLeft: S.sm }} size="small" color={C.nebulaTeal} />
                )}
              </View>
              {locationResults.length > 0 && (
                <ScrollView style={sc.locationDrop} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {locationResults.map(r => (
                    <TouchableOpacity key={r.place_id} style={sc.locationRow} onPress={() => selectLocation(r)}>
                      <Text style={sc.locationRowText} numberOfLines={1}>{formatPlace(r)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {lat !== '' && lon !== '' && (
                <Text style={sc.locationCoords}>
                  📍  {parseFloat(lat).toFixed(4)}°  {parseFloat(lon).toFixed(4)}°
                </Text>
              )}
              {tzDisplay !== '' && (
                <Text style={sc.locationTz}>{tzDisplay}</Text>
              )}
            </Card>

            {/* Calculate button */}
            <TouchableOpacity
              style={[sc.calcBtn, loading && sc.calcBtnDisabled]}
              onPress={handleCalculate}
              disabled={loading}
              activeOpacity={0.75}
            >
              {loading
                ? <ActivityIndicator color={C.void} />
                : <Text style={sc.calcBtnText}>♡  CALCULATE SYNASTRY  ♡</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* ── Person B summary strip ───────────────────────────────── */}
            {chartB && (() => {
              const sunB = chartB.planets.find(p => p.name === 'Sun');
              return (
                <View style={[sc.personAStrip, sc.personBStrip]}>
                  <Text style={sc.personALabel}>PERSON B</Text>
                  <Text style={sc.personAName}>{nameB}</Text>
                  {sunB && (
                    <Text style={sc.personAMeta}>
                      {sunB.signSymbol} {sunB.sign}  ·  {chartB.ascendant.signSymbol} {chartB.ascendant.sign} Rising
                    </Text>
                  )}
                </View>
              );
            })()}

            {/* ── Compatibility summary ────────────────────────────────── */}
            <SecHead title="COMPATIBILITY OVERVIEW" icon="♡" />
            <View style={sc.summaryRow}>
              <View style={[sc.summaryPill, { borderColor: ASPECT_COLORS.harmonious }]}>
                <Text style={[sc.summaryNum, { color: ASPECT_COLORS.harmonious }]}>{harmonious}</Text>
                <Text style={sc.summaryLbl}>Harmonious</Text>
              </View>
              <View style={[sc.summaryPill, { borderColor: ASPECT_COLORS.neutral }]}>
                <Text style={[sc.summaryNum, { color: ASPECT_COLORS.neutral }]}>{neutral}</Text>
                <Text style={sc.summaryLbl}>Neutral</Text>
              </View>
              <View style={[sc.summaryPill, { borderColor: ASPECT_COLORS.challenging }]}>
                <Text style={[sc.summaryNum, { color: ASPECT_COLORS.challenging }]}>{challenging}</Text>
                <Text style={sc.summaryLbl}>Challenging</Text>
              </View>
            </View>

            {/* ── Key aspects ─────────────────────────────────────────── */}
            {keyAspects.length > 0 && (
              <>
                <SecHead title="KEY CONNECTIONS" icon="✦" />
                <View style={sc.aspectList}>
                  {keyAspects.map((a, i) => (
                    <SynAspectRow key={i} a={a} highlighted />
                  ))}
                </View>
              </>
            )}

            {/* ── All aspects ──────────────────────────────────────────── */}
            <SecHead title={`ALL ASPECTS  (${aspects.length})`} icon="⚹" />
            <View style={sc.aspectList}>
              {aspects.length === 0
                ? <Text style={sc.noAspects}>No major aspects found.</Text>
                : aspects.map((a, i) => <SynAspectRow key={i} a={a} />)
              }
            </View>
          </>
        )}

        <View style={{ height: S.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.cosmos },
  scroll: { paddingHorizontal: S.md, paddingTop: S.sm },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  backBtn:     { width: 40 },
  backArrow:   { color: C.gold, fontSize: 22 },
  screenTitle: { color: C.goldBright, fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  screenSub:   { color: C.nebulaTeal, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  editBtn:     { width: 48, alignItems: 'flex-end' },
  editBtnText: { color: C.gold, fontSize: 13, fontWeight: '600' },

  personAStrip: {
    backgroundColor: C.nebula,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    padding: S.md,
    marginTop: S.md,
    marginBottom: S.sm,
  },
  personBStrip: {
    borderLeftColor: C.purple,
    marginTop: 0,
  },
  personALabel: { color: C.dimText, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  personAName:  { color: C.goldBright, fontSize: 16, fontWeight: '700', fontFamily: 'serif' },
  personAMeta:  { color: C.muted, fontSize: 11, marginTop: 3, letterSpacing: 0.3 },

  personBDivider: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: S.md,
  },
  personBLine: { flex: 1, height: 1, backgroundColor: C.starfield },
  personBTag: {
    color: C.purple,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 3,
    marginHorizontal: S.md,
  },

  card: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    padding: S.md,
    marginBottom: S.md,
  },
  fieldLabel: {
    color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2.5, marginBottom: S.sm,
  },
  textBox: {
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    color: C.white,
    fontSize: 15,
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
    marginBottom: S.sm,
  },
  row: { flexDirection: 'row' },

  pillBtn: {
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
    marginBottom: S.sm,
  },
  pillIcon: { fontSize: 15, marginRight: S.sm },
  pillText: { color: C.white, fontSize: 14 },

  locationSearchRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: S.sm,
  },
  locationInput: { flex: 1, marginBottom: 0 },
  locationDrop: {
    maxHeight: 200, backgroundColor: C.deepSpace,
    borderRadius: R.md, borderWidth: 1, borderColor: C.starfield, marginBottom: S.sm,
  },
  locationRow: {
    paddingHorizontal: S.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.starfield,
  },
  locationRowText: { color: C.white, fontSize: 13, lineHeight: 18 },
  locationCoords: {
    color: C.nebulaTeal, fontSize: 11, letterSpacing: 0.5, textAlign: 'center', marginTop: 2,
  },
  locationTz: {
    color: C.muted, fontSize: 10, letterSpacing: 0.5, textAlign: 'center', marginTop: 4,
  },

  calcBtn: {
    backgroundColor: C.purple,
    borderRadius: R.pill,
    paddingVertical: S.md + 4,
    alignItems: 'center',
    marginTop: S.sm,
    marginBottom: S.md,
    shadowColor: C.purple,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  calcBtnDisabled: { opacity: 0.55 },
  calcBtnText: {
    color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 2,
  },

  summaryRow: {
    flexDirection: 'row', gap: S.sm, marginBottom: S.sm,
  },
  summaryPill: {
    flex: 1, alignItems: 'center',
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    padding: S.md,
  },
  summaryNum: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  summaryLbl: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },

  secHead: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: S.md, marginBottom: S.sm,
  },
  secIcon:  { color: C.gold, fontSize: 13, marginRight: 6 },
  secTitle: { color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2.5 },
  secLine:  { flex: 1, height: 1, backgroundColor: C.starfield, marginLeft: S.sm },

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
  aspectRowHL: {
    backgroundColor: `${C.purpleDim}88`,
  },
  aspectPlanets: { flexDirection: 'row', alignItems: 'center', width: 68, gap: 2 },
  aspectPSym:    { fontSize: 18, width: 22, textAlign: 'center' },
  aspectSym:     { fontSize: 15, width: 20, textAlign: 'center', fontWeight: '700' },
  aspectMid:     { flex: 1, paddingHorizontal: S.sm },
  aspectType:    { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  aspectNames:   { color: C.dimText, fontSize: 10, marginTop: 1 },
  aspectOrb:     { color: C.moonSilver, fontSize: 11, minWidth: 40, textAlign: 'right' },

  noAspects: { color: C.muted, fontSize: 13, textAlign: 'center', padding: S.lg },
});
